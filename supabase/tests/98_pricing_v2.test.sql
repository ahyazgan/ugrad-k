-- Fiyat algoritması v2: hizmet seviyesi ↔ urgent eşlemesi, yeni ayar sütunları
reset role;
insert into public.orders (
  id, customer_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus, urgent, service_level
) values
  ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1, true, 'standart'),
  ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1, true, 'ekonomi'),
  ('10000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c1', 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1, false, 'acil');

do $$
declare s record;
begin
  -- Eski istemci: yalnız urgent=true → acil
  if (select service_level from public.orders where id = '10000000-0000-0000-0000-0000000000d1') <> 'acil' then raise exception 'urgent → acil olmalı'; end if;
  -- Seviye gönderildiyse urgent ona uyar
  if (select urgent from public.orders where id = '10000000-0000-0000-0000-0000000000d2') then raise exception 'ekonomi urgent olamaz'; end if;
  if not (select urgent from public.orders where id = '10000000-0000-0000-0000-0000000000d3') then raise exception 'acil urgent olmalı'; end if;
  update public.orders set service_level = 'standart' where id = '10000000-0000-0000-0000-0000000000d3';
  if (select urgent from public.orders where id = '10000000-0000-0000-0000-0000000000d3') then raise exception 'güncellemede urgent düşmeli'; end if;
  begin
    update public.orders set service_level = 'vip' where id = '10000000-0000-0000-0000-0000000000d3';
    raise exception 'geçersiz seviye kabul edildi';
  exception when check_violation then null;
  end;
  select * into s from public.pricing_settings where id = 1;
  if s.economy_discount_pct <> 25 or s.sunday_surcharge_pct <> 50 or s.max_weight_kg <> 20 or s.free_pickup_radius_km <> 40 then
    raise exception 'v2 varsayılanları hatalı';
  end if;
  begin
    update public.pricing_settings set economy_discount_pct = 95 where id = 1;
    raise exception 'ekonomi indirimi %%90 üstü kabul edildi';
  exception when check_violation then null;
  end;
end $$;
\echo '  98_pricing_v2.test.sql: tüm kontroller geçti'
