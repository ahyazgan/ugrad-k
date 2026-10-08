-- Yazgan Kurye — temel şema
-- Fiyat hesabı veritabanında yapılmaz: sipariş Edge Function üzerinden
-- packages/shared/pricing.ts ile hesaplanıp yazılır. Burada yalnızca
-- parametreler (pricing_settings) ve sonuç (orders.*_kurus, price_quote) tutulur.

create extension if not exists pgcrypto;

-- ───────────────────────── Enum'lar ─────────────────────────
create type public.user_role as enum ('musteri', 'kurye', 'admin');

create type public.order_status as enum (
  'beklemede', 'onaylandi', 'kuryeye_atandi', 'alindi', 'yolda', 'teslim_edildi',
  'iptal', 'sorunlu'
);

create type public.payment_method as enum ('kart', 'cari', 'nakit');
create type public.payment_status as enum ('odenmedi', 'odendi', 'iade_edildi', 'cari_hesap');
create type public.consent_type as enum ('kvkk_aydinlatma', 'acik_riza_konum', 'ticari_ileti');
create type public.istanbul_side as enum ('anadolu', 'avrupa');

-- ───────────────────────── Yardımcılar ─────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── Kurumsal hesaplar ─────────────────────────
create table public.corporate_accounts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  tax_office text,
  tax_number text,
  billing_address text,
  billing_email text,
  monthly_invoicing boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger corporate_accounts_updated before update on public.corporate_accounts
  for each row execute function public.set_updated_at();

-- ───────────────────────── Profiller ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'musteri',
  full_name text,
  phone text,
  email text,
  corporate_account_id uuid references public.corporate_accounts (id) on delete set null,
  push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_corporate_idx on public.profiles (corporate_account_id);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.current_role_is(r public.user_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = r);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role_is('admin');
$$;

-- Yeni kullanıcı → müşteri profili
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, email, full_name)
  values (new.id, new.phone, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rol ve kurumsal hesap yalnızca yönetici tarafından değiştirilebilir
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.corporate_account_id is distinct from old.corporate_account_id then
      raise exception 'Bu alanı yalnızca yönetici değiştirebilir' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ───────────────────────── Kuryeler ─────────────────────────
create table public.couriers (
  id uuid primary key references public.profiles (id) on delete cascade,
  plate text,
  vehicle_model text,
  license_no text,
  active boolean not null default true,
  is_on_shift boolean not null default false,
  last_lat double precision,
  last_lng double precision,
  last_location_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger couriers_updated before update on public.couriers
  for each row execute function public.set_updated_at();

-- Kurye çalışma saatleri (BTK raporu)
create table public.courier_shifts (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.couriers (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  start_lat double precision,
  start_lng double precision,
  end_lat double precision,
  end_lng double precision,
  check (ended_at is null or ended_at >= started_at)
);
create index courier_shifts_courier_idx on public.courier_shifts (courier_id, started_at desc);
-- Bir kuryenin aynı anda tek açık vardiyası olabilir
create unique index courier_shifts_one_open on public.courier_shifts (courier_id) where ended_at is null;

-- ───────────────────────── Fiyat ayarları ─────────────────────────
-- Tek satırlık tablo; alan adları PricingSettings ile birebir eşleşir.
create table public.pricing_settings (
  id smallint primary key default 1 check (id = 1),
  base_fee_kurus integer not null check (base_fee_kurus >= 0),
  included_km integer not null check (included_km >= 0),
  per_km_kurus integer not null check (per_km_kurus >= 0),
  urgent_surcharge_pct numeric(5, 2) not null check (urgent_surcharge_pct >= 0),
  night_holiday_surcharge_pct numeric(5, 2) not null check (night_holiday_surcharge_pct >= 0),
  night_start_hour smallint not null check (night_start_hour between 0 and 23),
  night_end_hour smallint not null check (night_end_hour between 0 and 23),
  half_day_start_hour smallint not null check (half_day_start_hour between 0 and 23),
  waiting_free_minutes integer not null check (waiting_free_minutes >= 0),
  waiting_block_minutes integer not null check (waiting_block_minutes > 0),
  waiting_block_fee_kurus integer not null check (waiting_block_fee_kurus >= 0),
  return_leg_discount_pct numeric(5, 2) not null check (return_leg_discount_pct between 0 and 100),
  heavy_threshold_kg numeric(6, 2) not null check (heavy_threshold_kg >= 0),
  heavy_surcharge_kurus integer not null check (heavy_surcharge_kurus >= 0),
  bridge_fee_kurus integer not null check (bridge_fee_kurus >= 0),
  corporate_tiers jsonb not null default '[]'::jsonb check (jsonb_typeof(corporate_tiers) = 'array'),
  vat_pct numeric(5, 2) not null check (vat_pct >= 0),
  utc_offset_minutes integer not null default 180,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create trigger pricing_settings_updated before update on public.pricing_settings
  for each row execute function public.set_updated_at();

-- Değişiklik geçmişi (fiyat itirazlarında hangi tarifenin geçerli olduğunu görmek için)
create table public.pricing_settings_history (
  id bigint generated always as identity primary key,
  settings jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create or replace function public.log_pricing_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.pricing_settings_history (settings, changed_by)
  values (to_jsonb(new), auth.uid());
  return new;
end $$;

create trigger pricing_settings_log after insert or update on public.pricing_settings
  for each row execute function public.log_pricing_settings();

-- Resmi tatiller (arife günleri half_day = true)
create table public.holidays (
  date date primary key,
  name text not null,
  half_day boolean not null default false
);

-- ───────────────────────── Adresler ─────────────────────────
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  label text,
  address_text text not null,
  details text,
  lat double precision not null,
  lng double precision not null,
  place_id text,
  side public.istanbul_side,
  contact_name text,
  contact_phone text,
  created_at timestamptz not null default now()
);
create index addresses_profile_idx on public.addresses (profile_id);

-- ───────────────────────── Siparişler ─────────────────────────
create sequence public.order_no_seq start 1000;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default ('YK-' || nextval('public.order_no_seq')),
  customer_id uuid not null references public.profiles (id),
  corporate_account_id uuid references public.corporate_accounts (id),
  status public.order_status not null default 'beklemede',
  courier_id uuid references public.couriers (id),

  pickup_address text not null,
  pickup_details text,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  pickup_side public.istanbul_side,
  pickup_contact_name text,
  pickup_contact_phone text,

  dropoff_address text not null,
  dropoff_details text,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  dropoff_side public.istanbul_side,
  dropoff_contact_name text,
  dropoff_contact_phone text,

  package_description text,
  weight_kg numeric(6, 2),
  large_package boolean not null default false,
  urgent boolean not null default false,
  round_trip boolean not null default false,
  bridge_crossings smallint not null default 0 check (bridge_crossings >= 0),
  scheduled_pickup_at timestamptz,
  customer_note text,

  distance_meters integer not null check (distance_meters >= 0),
  return_distance_meters integer check (return_distance_meters >= 0),
  duration_seconds integer,
  waiting_minutes integer not null default 0 check (waiting_minutes >= 0),
  price_quote jsonb not null,
  subtotal_kurus integer not null check (subtotal_kurus >= 0),
  vat_kurus integer not null check (vat_kurus >= 0),
  total_kurus integer not null check (total_kurus >= 0),

  payment_method public.payment_method not null default 'kart',
  payment_status public.payment_status not null default 'odenmedi',
  payment_ref text,

  tracking_token text not null unique default encode(gen_random_bytes(16), 'hex'),

  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  problem_note text,

  pod_photo_path text,
  pod_signature_path text,
  pod_receiver_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_courier_idx on public.orders (courier_id, status);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_corporate_month_idx on public.orders (corporate_account_id, delivered_at);
create trigger orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

-- İzinli durum geçişleri — packages/shared/orders.ts ORDER_TRANSITIONS ile aynı
-- (packages/shared/test/schema-sync.test.ts bu listeyi karşılaştırır).
create table public.order_status_transitions (
  from_status public.order_status not null,
  to_status public.order_status not null,
  primary key (from_status, to_status)
);
insert into public.order_status_transitions (from_status, to_status) values
  ('beklemede', 'onaylandi'),
  ('beklemede', 'iptal'),
  ('onaylandi', 'kuryeye_atandi'),
  ('onaylandi', 'iptal'),
  ('onaylandi', 'sorunlu'),
  ('kuryeye_atandi', 'alindi'),
  ('kuryeye_atandi', 'onaylandi'),
  ('kuryeye_atandi', 'iptal'),
  ('kuryeye_atandi', 'sorunlu'),
  ('alindi', 'yolda'),
  ('alindi', 'sorunlu'),
  ('yolda', 'teslim_edildi'),
  ('yolda', 'sorunlu'),
  ('sorunlu', 'onaylandi'),
  ('sorunlu', 'kuryeye_atandi'),
  ('sorunlu', 'alindi'),
  ('sorunlu', 'yolda'),
  ('sorunlu', 'teslim_edildi'),
  ('sorunlu', 'iptal');

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid,
  note text,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create or replace function public.orders_status_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not exists (
      select 1 from public.order_status_transitions
      where from_status = old.status and to_status = new.status
    ) then
      raise exception 'Geçersiz durum geçişi: % → %', old.status, new.status using errcode = '22023';
    end if;
    if new.status = 'kuryeye_atandi' and new.courier_id is null then
      raise exception 'Kurye atanmadan sipariş kuryeye_atandi olamaz' using errcode = '22023';
    end if;
    case new.status
      when 'kuryeye_atandi' then new.assigned_at := now();
      when 'alindi' then new.picked_up_at := coalesce(new.picked_up_at, now());
      when 'teslim_edildi' then new.delivered_at := now();
      when 'iptal' then new.cancelled_at := now();
      when 'onaylandi' then
        if old.status = 'kuryeye_atandi' then new.courier_id := null; new.assigned_at := null; end if;
      else null;
    end case;
  end if;
  return new;
end $$;

create trigger orders_status_guard before update on public.orders
  for each row execute function public.orders_status_guard();

create or replace function public.orders_status_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, auth.uid(),
            nullif(current_setting('app.status_note', true), ''));
  end if;
  return new;
end $$;

create trigger orders_status_log after insert or update on public.orders
  for each row execute function public.orders_status_log();

-- ───────────────────────── Kurye konumları ─────────────────────────
create table public.courier_locations (
  id bigint generated always as identity primary key,
  courier_id uuid not null references public.couriers (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m real,
  heading real,
  speed_mps real,
  recorded_at timestamptz not null default now()
);
create index courier_locations_courier_idx on public.courier_locations (courier_id, recorded_at desc);
create index courier_locations_order_idx on public.courier_locations (order_id, recorded_at desc);

create or replace function public.courier_location_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.couriers
     set last_lat = new.lat, last_lng = new.lng, last_location_at = new.recorded_at
   where id = new.courier_id;
  return new;
end $$;

create trigger courier_location_touch after insert on public.courier_locations
  for each row execute function public.courier_location_touch();

-- ───────────────────────── KVKK rızaları ─────────────────────────
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  consent_type public.consent_type not null,
  version text not null,
  granted boolean not null,
  created_at timestamptz not null default now(),
  user_agent text
);
create index consents_profile_idx on public.consents (profile_id, consent_type, created_at desc);

-- Kullanıcının her rıza türü için en güncel kararı
create view public.current_consents with (security_invoker = true) as
  select distinct on (profile_id, consent_type) profile_id, consent_type, version, granted, created_at
  from public.consents
  order by profile_id, consent_type, created_at desc;
