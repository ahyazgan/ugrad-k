-- Fiyat algoritması v2 (docs/fiyat-arastirmasi.md §8):
--  • hizmet seviyesi (ekonomi / standart / acil), ekonomi indirimi ve saat sınırı
--  • gece, Pazar ve resmi tatil ekleri ayrı (toplanmaz, en yükseği uygulanır);
--    night_holiday_surcharge_pct artık yalnız resmi tatil oranıdır
--  • motosiklet ağırlık sınırı, uzak alış (konumlanma) ücreti
alter table public.pricing_settings
  add column economy_discount_pct numeric(5, 2) not null default 25 check (economy_discount_pct between 0 and 90),
  add column economy_cutoff_hour smallint not null default 14 check (economy_cutoff_hour between 1 and 23),
  add column night_surcharge_pct numeric(5, 2) not null default 50 check (night_surcharge_pct between 0 and 300),
  add column sunday_surcharge_pct numeric(5, 2) not null default 50 check (sunday_surcharge_pct between 0 and 300),
  add column max_weight_kg numeric(5, 1) default 20 check (max_weight_kg is null or max_weight_kg > 0),
  add column service_center_lat double precision not null default 41.1295,
  add column service_center_lng double precision not null default 29.1135,
  add column free_pickup_radius_km numeric(6, 1) not null default 40 check (free_pickup_radius_km >= 0),
  add column remote_pickup_per_km_kurus integer not null default 1000 check (remote_pickup_per_km_kurus >= 0),
  add column remote_pickup_max_kurus integer not null default 30000 check (remote_pickup_max_kurus >= 0);

comment on column public.pricing_settings.night_holiday_surcharge_pct is 'Resmi tatil (arifede yarım gün) ek ücreti, %. Gece ve Pazar ayrı sütunlarda.';

-- Sipariş hizmet seviyesi; "urgent" geriye uyumluluk için tutulur (acil ⇔ urgent)
alter table public.orders
  add column service_level text not null default 'standart' check (service_level in ('ekonomi', 'standart', 'acil'));
update public.orders set service_level = 'acil' where urgent;

create or replace function public.sync_order_service_level()
returns trigger language plpgsql as $$
begin
  -- Eski istemciler yalnız urgent gönderirse seviyeyi türet; seviye gönderildiyse urgent'ı ona uydur
  if tg_op = 'INSERT' and new.service_level = 'standart' and new.urgent then
    new.service_level := 'acil';
  end if;
  new.urgent := new.service_level = 'acil';
  return new;
end $$;
create trigger orders_sync_service_level before insert or update of service_level, urgent on public.orders
  for each row execute function public.sync_order_service_level();
