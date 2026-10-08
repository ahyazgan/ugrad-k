-- Operasyon otomasyon ayarları (tek satır; panelden değiştirilir)
create table public.ops_settings (
  id smallint primary key default 1 check (id = 1),
  -- Kartla ödenmeyen sipariş bu kadar dakika sonra otomatik iptal edilir
  unpaid_card_timeout_minutes integer not null default 30 check (unpaid_card_timeout_minutes between 5 and 1440),
  -- Yeni siparişleri otomatik onayla (kart siparişleri ödeme alınınca)
  auto_approve boolean not null default true,
  -- Onaylı siparişlere en uygun kuryeyi otomatik ata
  auto_assign boolean not null default true,
  max_active_orders_per_courier integer not null default 3 check (max_active_orders_per_courier between 1 and 20),
  max_pickup_distance_km numeric(6, 2) not null default 15 check (max_pickup_distance_km > 0),
  location_max_age_minutes integer not null default 10 check (location_max_age_minutes between 1 and 120),
  -- Bu kadar dakika atanamayan siparişte yöneticiye uyarı
  unassigned_alert_minutes integer not null default 10 check (unassigned_alert_minutes between 1 and 240),
  updated_at timestamptz not null default now()
);
insert into public.ops_settings (id) values (1);
create trigger ops_settings_updated before update on public.ops_settings
  for each row execute function public.set_updated_at();

alter table public.ops_settings enable row level security;
create policy ops_settings_read on public.ops_settings for select using (auth.uid() is not null);
create policy ops_settings_admin_write on public.ops_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- Süresi dolan ödenmemiş kart siparişlerini iptal eder; iptal edilen sayıyı döner.
-- pg_cron ile 5 dakikada bir çalıştırılır (docs/kurulum.md §6).
create or replace function public.cancel_unpaid_card_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
  timeout integer := (select unpaid_card_timeout_minutes from public.ops_settings where id = 1);
begin
  perform set_config('app.status_note', 'Ödeme süresi doldu (otomatik iptal)', true);
  with c as (
    update public.orders
       set status = 'iptal', cancel_reason = 'Ödeme süresi içinde tamamlanmadı'
     where payment_method = 'kart'
       and payment_status = 'odenmedi'
       and status in ('beklemede', 'onaylandi')
       and created_at < now() - make_interval(mins => coalesce(timeout, 30))
    returning 1
  )
  select count(*) into n from c;
  return n;
end $$;

revoke execute on function public.cancel_unpaid_card_orders from public, anon, authenticated;
grant execute on function public.cancel_unpaid_card_orders to service_role;
