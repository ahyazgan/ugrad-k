-- Kurye hakedişi ve nakit mutabakatı
\set admin  '''00000000-0000-0000-0000-00000000000a'''
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set kurye2 '''00000000-0000-0000-0000-00000000000d'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''

reset role;
insert into public.orders (
  id, customer_id, courier_id, status, payment_method, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus, pod_photo_path
) values
  ('10000000-0000-0000-0000-0000000000e1', :cust1, :kurye, 'yolda', 'nakit', 'A', 41, 29, 'B', 41, 29, 5000, '{}', 40000, 8000, 48000, 'x/foto.jpg'),
  ('10000000-0000-0000-0000-0000000000e2', :cust1, :kurye, 'yolda', 'nakit', 'A', 41, 29, 'B', 41, 29, 5000, '{}', 40000, 8000, 48000, 'x/foto.jpg'),
  ('10000000-0000-0000-0000-0000000000e3', :cust1, :kurye, 'yolda', 'cari', 'A', 41, 29, 'B', 41, 29, 5000, '{}', 40000, 8000, 48000, 'x/foto.jpg');

-- Kurye: kuryeye ödemeli siparişte tahsilat bilgisi zorunlu
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$ begin
  begin
    perform public.set_order_status('10000000-0000-0000-0000-0000000000e1', 'teslim_edildi');
    raise exception 'tahsilat bilgisi olmadan teslim edildi';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.set_order_status('10000000-0000-0000-0000-0000000000e1', 'teslim_edildi', p_cash_collection => 'kredi');
    raise exception 'geçersiz tahsilat kabul edildi';
  exception when sqlstate '22023' then null;
  end;
end $$;
select status, payment_status, cash_collection, paid_kurus
  from public.set_order_status('10000000-0000-0000-0000-0000000000e1', 'teslim_edildi', p_cash_collection => 'nakit');
select status, payment_status, cash_collection
  from public.set_order_status('10000000-0000-0000-0000-0000000000e2', 'teslim_edildi', p_cash_collection => 'iban');
-- Cari siparişte tahsilat sorulmaz
select status from public.set_order_status('10000000-0000-0000-0000-0000000000e3', 'teslim_edildi');

do $$ begin
  if (select payment_status from public.orders where id = '10000000-0000-0000-0000-0000000000e1') <> 'odendi' then
    raise exception 'nakit tahsilatta ödeme alındı olmalı'; end if;
  if (select payment_status from public.orders where id = '10000000-0000-0000-0000-0000000000e2') = 'odendi' then
    raise exception 'IBAN bildirimi yönetici onayı beklemeli'; end if;
  if (select cash_collection from public.orders where id = '10000000-0000-0000-0000-0000000000e3') is not null then
    raise exception 'cari siparişte tahsilat yazılmamalı'; end if;
  -- Kurye ödeme modelini okuyabilir ama değiştiremez; hesaplaşma açamaz
  if (select courier_per_job_kurus from public.cost_settings) <> 15000 then raise exception 'ödeme modeli okunamadı'; end if;
  update public.cost_settings set courier_per_job_kurus = 1;
  if (select courier_per_job_kurus from public.cost_settings) <> 15000 then raise exception 'kurye ödeme modelini değiştirdi'; end if;
  begin
    perform public.create_courier_payout('00000000-0000-0000-0000-00000000000b');
    raise exception 'kurye hesaplaşma açtı';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.pending_courier_earnings();
    raise exception 'kurye bekleyen hakedişleri çağırdı';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Edge Function (service role) hakedişleri yazar
reset role;
do $$ begin
  if (select count(*) from public.pending_courier_earnings() where id::text like '10000000-0000-0000-0000-0000000000e%') <> 3 then
    raise exception 'bekleyen hakediş sayısı 3 olmalı'; end if;
end $$;
insert into public.courier_earnings (order_id, courier_id, delivered_at, km, job_kurus, km_kurus, bonus_kurus, waiting_kurus, bridge_kurus, total_kurus, cash_collected_kurus)
select id, courier_id, delivered_at, 5, 15000, 6000, 0, 0, 0, 21000, case when cash_collection = 'nakit' then total_kurus else 0 end
  from public.orders where id::text like '10000000-0000-0000-0000-0000000000e%';
insert into public.courier_earnings (order_id, courier_id, delivered_at, km, job_kurus, km_kurus, bonus_kurus, waiting_kurus, bridge_kurus, total_kurus)
values ('10000000-0000-0000-0000-000000000001', :kurye2, now(), 1, 1, 0, 0, 0, 0, 1)
on conflict (order_id) do nothing;

-- Kurye yalnız kendi hakedişini görür
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$ begin
  if (select count(*) from public.courier_earnings where courier_id <> auth.uid()) <> 0 then
    raise exception 'kurye başkasının hakedişini gördü'; end if;
  if (select count(*) from public.courier_earnings) < 3 then raise exception 'kurye kendi hakedişini göremedi'; end if;
end $$;

-- Yönetici hesaplaşır: 3 × 210 TL − 480 TL nakit = 150 TL
select set_config('request.jwt.claim.sub', :admin, false);
do $$
declare p public.courier_payouts;
begin
  p := public.create_courier_payout('00000000-0000-0000-0000-00000000000b', now(), 'Havale');
  if p.delivery_count <> 3 or p.earnings_kurus <> 63000 or p.cash_kurus <> 48000 or p.net_kurus <> 15000 then
    raise exception 'hesaplaşma tutarı hatalı: %', row_to_json(p); end if;
  if exists (select 1 from public.courier_earnings where courier_id = '00000000-0000-0000-0000-00000000000b' and payout_id is null) then
    raise exception 'hakedişler hesaplaşmaya bağlanmadı'; end if;
  begin
    perform public.create_courier_payout('00000000-0000-0000-0000-00000000000b');
    raise exception 'boş hesaplaşma açıldı';
  exception when sqlstate '22023' then null;
  end;
  perform public.cancel_courier_payout(p.id);
  if (select count(*) from public.courier_earnings where courier_id = '00000000-0000-0000-0000-00000000000b' and payout_id is null) <> 3 then
    raise exception 'iptalde hakedişler serbest kalmadı'; end if;
  update public.cost_settings set courier_per_job_kurus = 16000;
  if (select courier_per_job_kurus from public.cost_settings) <> 16000 then raise exception 'yönetici ödeme modelini değiştiremedi'; end if;
  update public.cost_settings set courier_per_job_kurus = 15000;
end $$;
reset role;
\echo '  99_courier_earnings.test.sql: tüm kontroller geçti'
