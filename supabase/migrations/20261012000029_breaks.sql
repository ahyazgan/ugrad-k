-- Mola: kurye vardiya içinde mola verir; molada otomatik iş almaz.
--  • courier_breaks: mola kayıtları (BTK çalışma saatleri raporunda net süre için)
--  • couriers.on_break: atama sorgusu için hızlı bayrak (start_break / end_break tutar)
--  • Otomatik mola: üst üste ops.offer_auto_break_after (3) teklife yanıt vermeyen kurye molaya alınır
--    (telefonu cebinde unutan kuryeye iş gitmeye devam etmesin); auto-dispatch kuryeye haber verir
--  • Uzun mola: ops.max_break_minutes (45) aşılırsa yöneticiye bir kez uyarı (auto-dispatch)

alter table public.ops_settings
  add column max_break_minutes integer not null default 45 check (max_break_minutes between 5 and 240),
  add column offer_auto_break_after integer not null default 3 check (offer_auto_break_after between 0 and 20);

alter table public.couriers add column on_break boolean not null default false;

create table public.courier_breaks (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.couriers (id) on delete cascade,
  shift_id uuid references public.courier_shifts (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  auto boolean not null default false,
  alerted_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create index courier_breaks_courier_idx on public.courier_breaks (courier_id, started_at desc);
create unique index courier_breaks_one_open on public.courier_breaks (courier_id) where ended_at is null;
alter table public.courier_breaks enable row level security;
create policy courier_breaks_read on public.courier_breaks for select using (public.is_admin() or courier_id = auth.uid());

-- Molaya çıkar (iç): bekleyen teklifler geri alınır (kabul oranını etkilemez)
create or replace function public.begin_break(p_courier_id uuid, p_auto boolean)
returns public.courier_breaks language plpgsql security definer set search_path = public as $$
declare
  b public.courier_breaks;
  sh uuid;
  r record;
begin
  select * into b from public.courier_breaks where courier_id = p_courier_id and ended_at is null;
  if found then
    return b;
  end if;
  select id into sh from public.courier_shifts where courier_id = p_courier_id and ended_at is null;
  if sh is null then
    raise exception 'Mola için önce vardiyayı başlatın' using errcode = '22023';
  end if;
  insert into public.courier_breaks (courier_id, shift_id, auto) values (p_courier_id, sh, p_auto) returning * into b;
  update public.couriers set on_break = true where id = p_courier_id;
  perform set_config('app.offer_response', 'geri_alindi', true);
  perform set_config('app.offer_reason', 'Mola', true);
  perform set_config('app.status_note', 'Kurye molada; teklif geri alındı', true);
  for r in
    select id from public.orders
     where courier_id = p_courier_id and status = 'kuryeye_atandi'
       and offer_expires_at is not null and offer_accepted_at is null
     for update
  loop
    update public.orders set status = 'onaylandi' where id = r.id;
  end loop;
  perform set_config('app.offer_response', '', true);
  perform set_config('app.offer_reason', '', true);
  return b;
end $$;
revoke execute on function public.begin_break from public, anon, authenticated;

create or replace function public.start_break()
returns public.courier_breaks language plpgsql security definer set search_path = public as $$
begin
  if not public.current_role_is('kurye') then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  return public.begin_break(auth.uid(), false);
end $$;

create or replace function public.end_break()
returns public.courier_breaks language plpgsql security definer set search_path = public as $$
declare
  b public.courier_breaks;
begin
  update public.courier_breaks set ended_at = now()
   where courier_id = auth.uid() and ended_at is null
  returning * into b;
  update public.couriers set on_break = false where id = auth.uid();
  return b;
end $$;
revoke execute on function public.start_break from public, anon;
revoke execute on function public.end_break from public, anon;
grant execute on function public.start_break to authenticated;
grant execute on function public.end_break to authenticated;

-- Vardiya bitince açık mola da kapanır
create or replace function public.end_shift(p_lat double precision default null, p_lng double precision default null)
returns public.courier_shifts
language plpgsql security definer set search_path = public as $$
declare
  s public.courier_shifts;
begin
  update public.courier_breaks set ended_at = now() where courier_id = auth.uid() and ended_at is null;
  update public.courier_shifts
     set ended_at = now(), end_lat = p_lat, end_lng = p_lng
   where courier_id = auth.uid() and ended_at is null
  returning * into s;
  update public.couriers set is_on_shift = false, on_break = false where id = auth.uid();
  if s.id is null then
    raise exception 'Açık vardiya yok' using errcode = '22023';
  end if;
  return s;
end $$;

-- Üst üste N teklife yanıt vermeyen vardiyadaki kuryeleri molaya alır; molaya alınanları döndürür.
-- Yalnız vardiya başından (veya son moladan dönüşten) sonraki teklifler sayılır.
create or replace function public.auto_break_unresponsive()
returns setof uuid language plpgsql security definer set search_path = public as $$
declare
  n integer;
  c record;
begin
  select offer_auto_break_after into n from public.ops_settings where id = 1;
  if coalesce(n, 0) = 0 then
    return;
  end if;
  for c in
    select k.id
      from public.couriers k
      join public.courier_shifts s on s.courier_id = k.id and s.ended_at is null
      cross join lateral (
        select greatest(s.started_at, coalesce((select max(b.ended_at) from public.courier_breaks b where b.courier_id = k.id), s.started_at)) as since
      ) w
     where k.is_on_shift and not k.on_break
       and (select count(*) filter (where last.response = 'zaman_asimi') = n and count(*) = n from (
              select o.response from public.courier_offers o
               where o.courier_id = k.id and o.offered_at >= w.since and o.response in ('kabul', 'ret', 'zaman_asimi')
               order by o.offered_at desc limit n
            ) last)
  loop
    perform public.begin_break(c.id, true);
    return next c.id;
  end loop;
end $$;
revoke execute on function public.auto_break_unresponsive from public, anon, authenticated;
grant execute on function public.auto_break_unresponsive to service_role;
