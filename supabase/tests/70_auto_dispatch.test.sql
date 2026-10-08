-- Otomatik onay ve sistem ataması
update public.ops_settings set auto_approve = true;
insert into public.orders (
  id, customer_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus, payment_method, payment_status
) values
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000c1', 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1, 'nakit', 'odenmedi'),
  ('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000c1', 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1, 'kart', 'odenmedi'),
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000c1', 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1, 'kart', 'odendi');

do $$ begin
  perform public.auto_approve_orders();
  if (select status from public.orders where id = '10000000-0000-0000-0000-000000000009') <> 'onaylandi' then raise exception 'nakit onaylanmalı'; end if;
  if (select status from public.orders where id = '10000000-0000-0000-0000-000000000010') <> 'beklemede' then raise exception 'ödenmemiş kart onaylanmamalı'; end if;
  if (select status from public.orders where id = '10000000-0000-0000-0000-000000000011') <> 'onaylandi' then raise exception 'ödenmiş kart onaylanmalı'; end if;
  if (select note from public.order_status_history where order_id = '10000000-0000-0000-0000-000000000009' and to_status = 'onaylandi') <> 'Otomatik onay' then
    raise exception 'onay notu yazılmalı';
  end if;
end $$;

update public.ops_settings set auto_approve = false;
insert into public.orders (id, customer_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus)
values ('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000c1', 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1);
do $$ begin
  if public.auto_approve_orders() <> 0 then raise exception 'kapalıyken onaylamamalı'; end if;
end $$;

-- Atama: vardiya dışı kuryeye atanmaz; vardiyadakine atanır, ikinci kez atanmaz
update public.couriers set is_on_shift = false where id = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  if public.system_assign_courier('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000d') then
    raise exception 'vardiya dışı kuryeye atanmamalı';
  end if;
end $$;
update public.couriers set is_on_shift = true, active = true where id = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  if not public.system_assign_courier('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000d', 'Otomatik atama (2,1 km)') then
    raise exception 'atanmalı';
  end if;
  if public.system_assign_courier('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000d') then
    raise exception 'atanmış sipariş tekrar atanmamalı';
  end if;
  if (select note from public.order_status_history where order_id = '10000000-0000-0000-0000-000000000009' and to_status = 'kuryeye_atandi') <> 'Otomatik atama (2,1 km)' then
    raise exception 'atama notu yazılmalı';
  end if;
  if not exists (select 1 from public.notifications where order_id = '10000000-0000-0000-0000-000000000009' and event = 'kuryeye_atandi') then
    raise exception 'kuryeye bildirim kuyruğa girmeli';
  end if;
end $$;

set role authenticated;
do $$ begin
  perform public.auto_approve_orders();
  raise exception 'BEKLENMEDİ: kullanıcı otomatik onay çağırdı';
exception when insufficient_privilege then null;
end $$;
reset role;
\echo '  70_auto_dispatch.test.sql: tüm kontroller geçti'
