-- Değerli gönderiler: teslim kodu ve değer beyanı
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set kurye2 '''00000000-0000-0000-0000-00000000000d'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''
\set cust2  '''00000000-0000-0000-0000-0000000000c2'''

reset role;
insert into public.orders (
  id, customer_id, courier_id, status, payment_method, delivery_code_required, declared_value_kurus, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus, pod_photo_path
) values
  ('10000000-0000-0000-0000-0000000000c7', :cust1, :kurye, 'yolda', 'cari', true, 2100000, 'A', 41, 29, 'B', 41, 29, 5000, '{}', 50000, 10000, 60000, 'x/f.jpg');

do $$ begin
  if (select delivery_code from public.order_secrets where order_id = '10000000-0000-0000-0000-0000000000c7') !~ '^[0-9]{4}$' then
    raise exception 'teslim kodu üretilmeli'; end if;
  if (select free_coverage_kurus from public.pricing_settings) <> 100000 then raise exception 'sigorta varsayılanı'; end if;
end $$;
-- Testte bilinen kod
update public.order_secrets set delivery_code = '4821' where order_id = '10000000-0000-0000-0000-0000000000c7';

-- Kurye kodu göremez, kod doğrulanmadan teslim edemez
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$
declare r jsonb;
begin
  if exists (select 1 from public.order_secrets) then raise exception 'kurye teslim kodunu gördü'; end if;
  begin
    perform public.set_order_status('10000000-0000-0000-0000-0000000000c7', 'teslim_edildi');
    raise exception 'kod doğrulanmadan teslim edildi';
  exception when sqlstate '22023' then null;
  end;
  r := public.verify_delivery_code('10000000-0000-0000-0000-0000000000c7', '0000');
  if (r ->> 'ok')::boolean or (r ->> 'remaining')::int <> 4 then raise exception 'yanlış kod: %', r; end if;
  r := public.verify_delivery_code('10000000-0000-0000-0000-0000000000c7', ' 4821 ');
  if not (r ->> 'ok')::boolean then raise exception 'doğru kod kabul edilmedi'; end if;
end $$;
select status from public.set_order_status('10000000-0000-0000-0000-0000000000c7', 'teslim_edildi');

-- Başka kurye kodu deneyemez
select set_config('request.jwt.claim.sub', :kurye2, false);
do $$ begin
  begin
    perform public.verify_delivery_code('10000000-0000-0000-0000-0000000000c7', '1111');
    raise exception 'başka kurye kod denedi';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Müşteri kendi kodunu görür, başka müşteri görmez
select set_config('request.jwt.claim.sub', :cust1, false);
do $$ begin
  if (select delivery_code from public.order_secrets where order_id = '10000000-0000-0000-0000-0000000000c7') <> '4821' then
    raise exception 'müşteri kodu göremedi'; end if;
end $$;
select set_config('request.jwt.claim.sub', :cust2, false);
do $$ begin
  if exists (select 1 from public.order_secrets) then raise exception 'başka müşteri kodu gördü'; end if;
end $$;

-- 5 yanlış denemede kilit
reset role;
insert into public.orders (
  id, customer_id, courier_id, status, payment_method, delivery_code_required, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus
) values ('10000000-0000-0000-0000-0000000000c8', :cust1, :kurye, 'yolda', 'cari', true, 'A', 41, 29, 'B', 41, 29, 5000, '{}', 1, 0, 1);
update public.order_secrets set delivery_code = '1234' where order_id = '10000000-0000-0000-0000-0000000000c8';
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$ begin
  for i in 1..5 loop perform public.verify_delivery_code('10000000-0000-0000-0000-0000000000c8', '9999'); end loop;
  begin
    perform public.verify_delivery_code('10000000-0000-0000-0000-0000000000c8', '1234');
    raise exception 'kilitten sonra doğru kod kabul edildi';
  exception when sqlstate '22023' then null;
  end;
end $$;
reset role;
\echo '  9C_valuable_shipments.test.sql: tüm kontroller geçti'
