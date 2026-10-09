-- Kurye hedef primleri (teşvik kampanyaları).
--  • courier_incentives: panelden kampanya
--      hedef: gün/hafta içinde N iş → ödül (kademeli; ulaşılan en yüksek kademe ödenir)
--      yuzde: seçili gün/saatlerde tamamlanan işlerin hakedişine +%X (ör. Cumartesi, yağmurlu gün)
--    Gün filtresi (weekdays, 1=Pzt…7=Paz), saat aralığı (İstanbul), tarih aralığı
--  • courier_incentive_awards: kapanan dönemler için hesaplanan ödüller (courier-earnings cron'u
--    compute_incentive_awards() ile yazar); hesaplaşmada hakedişe eklenir
--  • my_incentive_progress(): kurye uygulamasında bu gün/haftanın ilerlemesi

create table public.courier_incentives (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 80),
  kind text not null check (kind in ('hedef', 'yuzde')),
  period text not null check (period in ('gunluk', 'haftalik')),
  -- hedef: [{"target": 10, "rewardKurus": 15000}, …] (hedef ve ödül artan)
  tiers jsonb not null default '[]',
  bonus_pct numeric(5, 2) check (bonus_pct is null or bonus_pct between 1 and 100),
  weekdays smallint[] check (weekdays is null or weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  start_hour smallint not null default 0 check (start_hour between 0 and 23),
  end_hour smallint not null default 24 check (end_hour between 1 and 24),
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  check (end_hour > start_hour),
  check (ends_on is null or ends_on >= starts_on),
  check ((kind = 'hedef' and jsonb_typeof(tiers) = 'array' and jsonb_array_length(tiers) > 0)
      or (kind = 'yuzde' and bonus_pct is not null))
);
alter table public.courier_incentives enable row level security;
create policy courier_incentives_admin on public.courier_incentives for all using (public.is_admin()) with check (public.is_admin());
create policy courier_incentives_courier_read on public.courier_incentives for select using (active and public.current_role_is('kurye'));

create table public.courier_incentive_awards (
  id uuid primary key default gen_random_uuid(),
  incentive_id uuid not null references public.courier_incentives (id) on delete cascade,
  courier_id uuid not null references public.couriers (id) on delete restrict,
  period_start date not null,
  period_end date not null,
  achieved integer not null,
  amount_kurus integer not null check (amount_kurus > 0),
  detail text,
  payout_id uuid references public.courier_payouts (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (incentive_id, courier_id, period_start)
);
create index courier_incentive_awards_unpaid_idx on public.courier_incentive_awards (courier_id) where payout_id is null;
alter table public.courier_incentive_awards enable row level security;
create policy courier_incentive_awards_read on public.courier_incentive_awards for select using (public.is_admin() or courier_id = auth.uid());

alter table public.courier_payouts add column incentive_kurus integer not null default 0;

-- Kampanyaya uyan tamamlanmış işler: tarih aralığı (İstanbul günü), gün ve saat filtresi
create or replace function public.incentive_jobs(p_inc public.courier_incentives, p_courier_id uuid, p_from date, p_to date)
returns table (order_id uuid, completed_at timestamptz, earning_kurus integer)
language sql stable security definer set search_path = public as $$
  select o.id, o.completed_at, coalesce(e.total_kurus, 0)
    from public.orders o
    left join public.courier_earnings e on e.order_id = o.id
   where o.courier_id = p_courier_id
     and o.status in ('teslim_edildi', 'geri_teslim')
     and o.completed_at >= public.istanbul_ts(p_from, '00:00')
     and o.completed_at < public.istanbul_ts(p_to + 1, '00:00')
     and (p_inc.weekdays is null or extract(isodow from o.completed_at at time zone 'Europe/Istanbul')::smallint = any (p_inc.weekdays))
     and extract(hour from o.completed_at at time zone 'Europe/Istanbul') >= p_inc.start_hour
     and extract(hour from o.completed_at at time zone 'Europe/Istanbul') < p_inc.end_hour;
$$;
revoke execute on function public.incentive_jobs from public, anon, authenticated;

-- Hedef kampanyasında ulaşılan en yüksek kademenin ödülü
create or replace function public.incentive_tier_reward(p_tiers jsonb, p_jobs integer)
returns integer language sql immutable as $$
  select coalesce(max((t ->> 'rewardKurus')::integer), 0)
    from jsonb_array_elements(p_tiers) t
   where (t ->> 'target')::integer <= p_jobs;
$$;

-- Kapanan dönemlerin ödüllerini yazar (son 14 gün; tekrar çalıştırılabilir)
create or replace function public.compute_incentive_awards()
returns integer language plpgsql security definer set search_path = public as $$
declare
  inc public.courier_incentives;
  today date := (now() at time zone 'Europe/Istanbul')::date;
  p_start date;
  p_end date;
  c record;
  jobs integer;
  earn integer;
  amount integer;
  n integer := 0;
begin
  for inc in select * from public.courier_incentives where active loop
    p_start := greatest(inc.starts_on, today - 14);
    if inc.period = 'haftalik' then
      p_start := date_trunc('week', p_start)::date;
    end if;
    while p_start < today loop
      p_end := case when inc.period = 'gunluk' then p_start else p_start + 6 end;
      exit when p_end >= today; -- dönem kapanmadı
      if (inc.ends_on is null or p_start <= inc.ends_on) and p_end >= inc.starts_on then
        for c in select id from public.couriers loop
          select count(*)::integer, coalesce(sum(j.earning_kurus), 0)::integer into jobs, earn
            from public.incentive_jobs(inc, c.id, greatest(p_start, inc.starts_on), least(p_end, coalesce(inc.ends_on, p_end))) j;
          continue when jobs = 0;
          amount := case when inc.kind = 'hedef' then public.incentive_tier_reward(inc.tiers, jobs)
                         else round(earn * inc.bonus_pct / 100)::integer end;
          if amount > 0 then
            insert into public.courier_incentive_awards (incentive_id, courier_id, period_start, period_end, achieved, amount_kurus, detail)
            values (inc.id, c.id, p_start, p_end, jobs, amount,
                    case when inc.kind = 'hedef' then jobs || ' iş'
                         else jobs || ' iş, hakediş ' || replace(to_char(earn / 100.0, 'FM9999990.00'), '.', ',') || ' TL × %'
                              || replace(trim_scale(inc.bonus_pct)::text, '.', ',') end)
            on conflict (incentive_id, courier_id, period_start) do nothing;
            if found then n := n + 1; end if;
          end if;
        end loop;
      end if;
      p_start := p_end + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function public.compute_incentive_awards from public, anon, authenticated;
grant execute on function public.compute_incentive_awards to service_role;

-- Kurye: bugünün/bu haftanın kampanyaları ve ilerlemesi
create or replace function public.my_incentive_progress()
returns table (
  incentive_id uuid, title text, kind text, period text, tiers jsonb, bonus_pct numeric, weekdays smallint[],
  start_hour smallint, end_hour smallint, period_start date, period_end date, jobs integer, earning_kurus integer
)
language sql stable security definer set search_path = public as $$
  with today as (select (now() at time zone 'Europe/Istanbul')::date as d)
  select i.id, i.title, i.kind, i.period, i.tiers, i.bonus_pct, i.weekdays, i.start_hour, i.end_hour, ps.s, ps.e,
         (select count(*)::integer from public.incentive_jobs(i, auth.uid(), greatest(ps.s, i.starts_on), least(ps.e, coalesce(i.ends_on, ps.e)))),
         (select coalesce(sum(j.earning_kurus), 0)::integer from public.incentive_jobs(i, auth.uid(), greatest(ps.s, i.starts_on), least(ps.e, coalesce(i.ends_on, ps.e))) j)
    from public.courier_incentives i, today
    cross join lateral (
      select case when i.period = 'gunluk' then today.d else date_trunc('week', today.d)::date end as s,
             case when i.period = 'gunluk' then today.d else date_trunc('week', today.d)::date + 6 end as e
    ) ps
   where i.active and public.current_role_is('kurye')
     and i.starts_on <= ps.e and (i.ends_on is null or i.ends_on >= ps.s)
   order by i.created_at;
$$;
revoke execute on function public.my_incentive_progress from public, anon;
grant execute on function public.my_incentive_progress to authenticated;

-- Hesaplaşma: ödenmemiş primler de dahil (net = hakediş + prim − kuryedeki nakit)
create or replace function public.create_courier_payout(p_courier_id uuid, p_until timestamptz default now(), p_note text default null)
returns public.courier_payouts language plpgsql security definer set search_path = public as $$
declare
  p public.courier_payouts;
  c integer;
  earned integer;
  cash integer;
  bonus integer;
begin
  if not public.is_admin() then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  perform 1 from public.couriers where id = p_courier_id for update;
  if not found then
    raise exception 'Kurye bulunamadı' using errcode = 'P0002';
  end if;
  select count(*), coalesce(sum(total_kurus), 0), coalesce(sum(cash_collected_kurus), 0)
    into c, earned, cash
    from public.courier_earnings
    where courier_id = p_courier_id and payout_id is null and delivered_at <= p_until;
  select coalesce(sum(amount_kurus), 0) into bonus
    from public.courier_incentive_awards
    where courier_id = p_courier_id and payout_id is null and created_at <= p_until;
  if c = 0 and bonus = 0 then
    raise exception 'Hesaplaşılacak teslimat yok' using errcode = '22023';
  end if;
  insert into public.courier_payouts (courier_id, until_at, delivery_count, earnings_kurus, incentive_kurus, cash_kurus, net_kurus, note, created_by)
  values (p_courier_id, p_until, c, earned, bonus, cash, earned + bonus - cash, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning * into p;
  update public.courier_earnings set payout_id = p.id
    where courier_id = p_courier_id and payout_id is null and delivered_at <= p_until;
  update public.courier_incentive_awards set payout_id = p.id
    where courier_id = p_courier_id and payout_id is null and created_at <= p_until;
  return p;
end $$;

create or replace function public.cancel_courier_payout(p_payout_id uuid)
returns public.courier_payouts language plpgsql security definer set search_path = public as $$
declare
  p public.courier_payouts;
begin
  if not public.is_admin() then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  update public.courier_payouts set cancelled_at = now()
    where id = p_payout_id and cancelled_at is null returning * into p;
  if not found then
    raise exception 'Hesaplaşma bulunamadı veya zaten iptal' using errcode = 'P0002';
  end if;
  update public.courier_earnings set payout_id = null where payout_id = p_payout_id;
  update public.courier_incentive_awards set payout_id = null where payout_id = p_payout_id;
  return p;
end $$;
