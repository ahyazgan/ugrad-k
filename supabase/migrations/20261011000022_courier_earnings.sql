-- Kurye hakedişi ve nakit mutabakatı.
--  • cost_settings: kurye ödeme modeli + genel gider (panel → Fiyatlar → Maliyet modeli). packages/shared/cost.ts
--  • orders.cash_collection: kuryeye ödemeli (nakit) siparişte teslimde tahsilat şekli
--  • courier_earnings: teslim edilen her siparişin hakedişi (courier-earnings Edge Function yazar)
--  • courier_payouts: yöneticinin kurye ile hesaplaşması (hakediş − kuryedeki nakit)

create table public.cost_settings (
  id smallint primary key default 1 check (id = 1),
  courier_per_job_kurus integer not null default 15000 check (courier_per_job_kurus >= 0),
  courier_per_km_kurus integer not null default 1200 check (courier_per_km_kurus >= 0),
  urgent_bonus_pct numeric(5, 2) not null default 30 check (urgent_bonus_pct between 0 and 300),
  off_hours_bonus_pct numeric(5, 2) not null default 30 check (off_hours_bonus_pct between 0 and 300),
  economy_job_pay_pct numeric(5, 2) not null default 60 check (economy_job_pay_pct between 0 and 100),
  waiting_share_pct numeric(5, 2) not null default 50 check (waiting_share_pct between 0 and 100),
  overhead_per_job_kurus integer not null default 3000 check (overhead_per_job_kurus >= 0),
  card_fee_pct numeric(5, 2) not null default 2.5 check (card_fee_pct between 0 and 20),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.cost_settings (id) values (1);
create trigger cost_settings_updated before update on public.cost_settings
  for each row execute function public.set_updated_at();
alter table public.cost_settings enable row level security;
-- Kurye kendi ödeme modelini görebilir (Kazancım ekranında açıklama)
create policy cost_settings_read on public.cost_settings for select
  using (public.is_admin() or public.current_role_is('kurye'));
create policy cost_settings_admin_write on public.cost_settings for update
  using (public.is_admin()) with check (public.is_admin());

-- Kuryeye ödemeli siparişte tahsilat şekli (teslimde kurye seçer)
alter table public.orders
  add column cash_collection text check (cash_collection in ('nakit', 'iban', 'alinmadi')),
  add column cash_collected_at timestamptz;

create table public.courier_payouts (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.couriers (id) on delete restrict,
  until_at timestamptz not null,
  delivery_count integer not null,
  earnings_kurus integer not null,
  cash_kurus integer not null,
  net_kurus integer not null,
  note text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index courier_payouts_courier_idx on public.courier_payouts (courier_id, created_at desc);

create table public.courier_earnings (
  order_id uuid primary key references public.orders (id) on delete cascade,
  courier_id uuid not null references public.couriers (id) on delete restrict,
  delivered_at timestamptz not null,
  km numeric(7, 1) not null,
  job_kurus integer not null,
  km_kurus integer not null,
  bonus_kurus integer not null,
  waiting_kurus integer not null,
  bridge_kurus integer not null,
  total_kurus integer not null,
  -- Kuryenin müşteriden nakit alıp elinde tuttuğu tutar (hakedişten düşülür)
  cash_collected_kurus integer not null default 0,
  payout_id uuid references public.courier_payouts (id) on delete set null,
  created_at timestamptz not null default now()
);
create index courier_earnings_unpaid_idx on public.courier_earnings (courier_id, delivered_at) where payout_id is null;

alter table public.courier_earnings enable row level security;
alter table public.courier_payouts enable row level security;
create policy courier_earnings_read on public.courier_earnings for select
  using (courier_id = auth.uid() or public.is_admin());
create policy courier_payouts_read on public.courier_payouts for select
  using (courier_id = auth.uid() or public.is_admin());

-- Teslim edilmiş, kuryesi olan ve hakedişi henüz yazılmamış siparişler (courier-earnings işler)
create or replace function public.pending_courier_earnings(p_limit integer default 200)
returns setof public.orders language sql stable security definer set search_path = public as $$
  select o.* from public.orders o
  where o.status = 'teslim_edildi' and o.courier_id is not null
    and not exists (select 1 from public.courier_earnings e where e.order_id = o.id)
  order by o.delivered_at
  limit p_limit;
$$;
revoke execute on function public.pending_courier_earnings from public, anon, authenticated;
grant execute on function public.pending_courier_earnings to service_role;

-- Yönetici: kuryenin p_until'e kadar teslim ettiği ödenmemiş hakedişleri tek hesaplaşmada kapatır
create or replace function public.create_courier_payout(p_courier_id uuid, p_until timestamptz default now(), p_note text default null)
returns public.courier_payouts language plpgsql security definer set search_path = public as $$
declare
  p public.courier_payouts;
  c integer;
  earned integer;
  cash integer;
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
  if c = 0 then
    raise exception 'Hesaplaşılacak teslimat yok' using errcode = '22023';
  end if;
  insert into public.courier_payouts (courier_id, until_at, delivery_count, earnings_kurus, cash_kurus, net_kurus, note, created_by)
  values (p_courier_id, p_until, c, earned, cash, earned - cash, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning * into p;
  update public.courier_earnings set payout_id = p.id
    where courier_id = p_courier_id and payout_id is null and delivered_at <= p_until;
  return p;
end $$;

-- Yanlış hesaplaşmayı geri alır: teslimatlar tekrar ödenmemiş olur
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
  return p;
end $$;
revoke execute on function public.create_courier_payout from public, anon;
revoke execute on function public.cancel_courier_payout from public, anon;
grant execute on function public.create_courier_payout to authenticated;
grant execute on function public.cancel_courier_payout to authenticated;

-- set_order_status: kuryeye ödemeli siparişi teslim eden kurye tahsilat şeklini bildirir.
--   nakit → ödeme alındı, nakit kuryede (hakedişten düşülür)
--   iban  → müşteri şirket hesabına gönderdi; yönetici hesapta görünce "ödendi" işaretler
--   alinmadi → alacak; yönetici takip eder
drop function public.set_order_status(uuid, public.order_status, text, integer, text, text, text);
create function public.set_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_note text default null,
  p_waiting_minutes integer default null,
  p_pod_photo_path text default null,
  p_pod_signature_path text default null,
  p_pod_receiver_name text default null,
  p_cash_collection text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  uid uuid := auth.uid();
  is_adm boolean := public.is_admin();
begin
  if uid is null then
    raise exception 'Giriş gerekli' using errcode = '42501';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Sipariş bulunamadı' using errcode = 'P0002';
  end if;

  if not is_adm then
    if o.customer_id = uid then
      if not (p_status = 'iptal' and o.status in ('beklemede', 'onaylandi')) then
        raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
      end if;
    elsif o.courier_id = uid and public.current_role_is('kurye') then
      if not (
        p_status in ('alindi', 'yolda', 'teslim_edildi', 'sorunlu')
        or (p_status = 'onaylandi' and o.status = 'kuryeye_atandi')
      ) then
        raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
      end if;
    else
      raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
    end if;
  end if;

  -- Kurye teslimde kanıt yüklemek zorunda; yönetici (ör. kuryenin telefonu kapandıysa) kanıtsız kapatabilir
  if p_status = 'teslim_edildi' and not is_adm
     and coalesce(p_pod_photo_path, o.pod_photo_path, p_pod_signature_path, o.pod_signature_path) is null then
    raise exception 'Teslim için fotoğraf veya imza gerekli' using errcode = '22023';
  end if;
  if p_cash_collection is not null and p_cash_collection not in ('nakit', 'iban', 'alinmadi') then
    raise exception 'Tahsilat şekli geçersiz' using errcode = '22023';
  end if;
  if p_status = 'teslim_edildi' and not is_adm and o.payment_method = 'nakit'
     and o.payment_status <> 'odendi' and p_cash_collection is null then
    raise exception 'Kuryeye ödemeli siparişte tahsilat bilgisi gerekli' using errcode = '22023';
  end if;
  if p_status in ('iptal', 'sorunlu') and nullif(trim(coalesce(p_note, '')), '') is null and not is_adm then
    raise exception 'Lütfen bir açıklama girin' using errcode = '22023';
  end if;
  if p_waiting_minutes is not null and p_waiting_minutes < 0 then
    raise exception 'Bekleme süresi geçersiz' using errcode = '22023';
  end if;

  perform set_config('app.status_note', coalesce(p_note, ''), true);

  update public.orders set
    status = p_status,
    waiting_minutes = coalesce(p_waiting_minutes, waiting_minutes),
    pod_photo_path = coalesce(p_pod_photo_path, pod_photo_path),
    pod_signature_path = coalesce(p_pod_signature_path, pod_signature_path),
    pod_receiver_name = coalesce(p_pod_receiver_name, pod_receiver_name),
    cancel_reason = case when p_status = 'iptal' then p_note else cancel_reason end,
    problem_note = case when p_status = 'sorunlu' then p_note else problem_note end,
    cash_collection = case when o.payment_method = 'nakit' then coalesce(p_cash_collection, cash_collection) else cash_collection end,
    cash_collected_at = case when o.payment_method = 'nakit' and p_cash_collection is not null then now() else cash_collected_at end,
    payment_status = case
      when o.payment_method = 'nakit' and p_cash_collection = 'nakit' then 'odendi'::public.payment_status
      else payment_status end,
    paid_kurus = case
      when o.payment_method = 'nakit' and p_cash_collection = 'nakit' then o.total_kurus
      else paid_kurus end,
    paid_at = case
      when o.payment_method = 'nakit' and p_cash_collection = 'nakit' then now()
      else paid_at end
  where id = p_order_id
  returning * into o;

  return o;
end $$;
revoke execute on function public.set_order_status from public, anon;
grant execute on function public.set_order_status to authenticated;
