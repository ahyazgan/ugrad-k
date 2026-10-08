-- İş teklifi: otomatik atama teklif açar; kurye kabul/ret eder; süre dolunca geri alınır
\set admin  '''00000000-0000-0000-0000-00000000000a'''
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set kurye2 '''00000000-0000-0000-0000-00000000000d'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''

reset role;
update public.couriers set is_on_shift = true, active = true where id in (:kurye, :kurye2);
insert into public.orders (
  id, customer_id, status, service_level, payment_method, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus
) values
  ('20000000-0000-0000-0000-0000000000a1', :cust1, 'onaylandi', 'standart', 'cari', 'A', 41, 29, 'B', 41, 29, 5000, '{}', 40000, 8000, 48000),
  ('20000000-0000-0000-0000-0000000000a2', :cust1, 'onaylandi', 'standart', 'cari', 'A', 41, 29, 'B', 41, 29, 5000, '{}', 40000, 8000, 48000),
  ('20000000-0000-0000-0000-0000000000a3', :cust1, 'onaylandi', 'standart', 'cari', 'A', 41, 29, 'B', 41, 29, 5000, '{}', 40000, 8000, 48000),
  ('20000000-0000-0000-0000-0000000000a4', :cust1, 'onaylandi', 'standart', 'cari', 'A', 41, 29, 'B', 41, 29, 5000, '{}', 40000, 8000, 48000);

-- Otomatik atama → teklif (süre 60 sn), teklif kaydı açık
do $$ begin
  if not public.system_assign_courier('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b') then
    raise exception 'atama yapılamadı'; end if;
  perform public.system_assign_courier('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000b');
  perform public.system_assign_courier('20000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000b');
  if (select offer_accepted_at is not null or offer_expires_at is null
        or abs(extract(epoch from offer_expires_at - now()) - 60) > 2
      from public.orders where id = '20000000-0000-0000-0000-0000000000a1') then
    raise exception 'otomatik atama teklif olmalı'; end if;
  if (select count(*) from public.courier_offers where responded_at is null and order_id::text like '20000000-%') <> 3 then raise exception 'teklif kaydı açılmadı'; end if;
end $$;

-- Kurye: kabul etmeden paketi alamaz; kabul eder; reddeder (nedenle)
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$
declare r jsonb;
begin
  begin
    perform public.set_order_status('20000000-0000-0000-0000-0000000000a1', 'alindi');
    raise exception 'kabul edilmeden alış yapıldı';
  exception when sqlstate '22023' then null;
  end;
  r := public.respond_offer('20000000-0000-0000-0000-0000000000a1', true);
  if not (r ->> 'ok')::boolean then raise exception 'kabul edilemedi: %', r; end if;
  perform public.set_order_status('20000000-0000-0000-0000-0000000000a1', 'alindi', null, 0);
  r := public.respond_offer('20000000-0000-0000-0000-0000000000a2', false, 'Çok uzak');
  if not (r ->> 'ok')::boolean then raise exception 'ret başarısız: %', r; end if;
  -- Aynı teklife ikinci yanıt geçersiz
  r := public.respond_offer('20000000-0000-0000-0000-0000000000a2', true);
  if (r ->> 'ok')::boolean then raise exception 'reddedilen teklif kabul edildi'; end if;
  -- Kurye kendi tekliflerini görür
  if (select count(*) from public.courier_offers where order_id::text like '20000000-%') <> 3 then raise exception 'kurye tekliflerini görmeli'; end if;
end $$;

-- Başka kurye bu teklife yanıt veremez
select set_config('request.jwt.claim.sub', :kurye2, false);
do $$ begin
  perform public.respond_offer('20000000-0000-0000-0000-0000000000a3', true);
  raise exception 'başka kuryenin teklifine yanıt verildi';
exception when sqlstate '42501' then null;
end $$;
do $$ begin
  if (select count(*) from public.courier_offers where order_id::text like '20000000-%') <> 0 then raise exception 'başka kuryenin teklifleri görünmemeli'; end if;
end $$;
reset role;

do $$ begin
  if (select status from public.orders where id = '20000000-0000-0000-0000-0000000000a2') <> 'onaylandi'
     or (select courier_id from public.orders where id = '20000000-0000-0000-0000-0000000000a2') is not null then
    raise exception 'reddedilen iş havuza dönmeli'; end if;
  if (select response || '/' || reason from public.courier_offers where order_id = '20000000-0000-0000-0000-0000000000a2') <> 'ret/Çok uzak' then
    raise exception 'ret nedeni kaydedilmeli'; end if;
  if (select response from public.courier_offers where order_id = '20000000-0000-0000-0000-0000000000a1') <> 'kabul' then
    raise exception 'kabul kaydedilmeli'; end if;
end $$;

-- Süresi dolan teklif geri alınır
update public.orders set offer_expires_at = now() - interval '1 minute' where id = '20000000-0000-0000-0000-0000000000a3';
do $$ begin
  if public.expire_offers() <> 1 then raise exception 'süresi dolan teklif geri alınmalı'; end if;
  if (select status from public.orders where id = '20000000-0000-0000-0000-0000000000a3') <> 'onaylandi' then
    raise exception 'süresi dolan iş havuza dönmeli'; end if;
  if (select response from public.courier_offers where order_id = '20000000-0000-0000-0000-0000000000a3') <> 'zaman_asimi' then
    raise exception 'zaman aşımı kaydedilmeli'; end if;
  if (select note from public.order_status_history where order_id = '20000000-0000-0000-0000-0000000000a3' order by id desc limit 1)
     <> 'Teklif süresi doldu' then raise exception 'geçmişe not düşülmeli'; end if;
end $$;

-- Yönetici ataması doğrudan kabul sayılır (teklif yok); bekleyen teklifi yönetici başka kuryeye verirse eski teklif geri alınır
do $$ begin
  perform public.system_assign_courier('20000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000000b');
end $$;
select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
select public.assign_courier('20000000-0000-0000-0000-0000000000a4', :kurye2);
reset role;
do $$ begin
  if (select offer_expires_at is not null or offer_accepted_at is null from public.orders where id = '20000000-0000-0000-0000-0000000000a4') then
    raise exception 'yönetici ataması doğrudan olmalı'; end if;
  if (select response from public.courier_offers where order_id = '20000000-0000-0000-0000-0000000000a4') <> 'geri_alindi' then
    raise exception 'eski teklif geri alınmalı'; end if;
  if (select count(*) from public.courier_offers where order_id = '20000000-0000-0000-0000-0000000000a4') <> 1 then
    raise exception 'doğrudan atama teklif kaydı açmamalı'; end if;
end $$;

-- Teklif kapalıyken otomatik atama doğrudan olur
update public.ops_settings set offer_enabled = false where id = 1;
update public.orders set status = 'onaylandi' where id = '20000000-0000-0000-0000-0000000000a2';
do $$ begin
  perform public.system_assign_courier('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000d');
  if (select offer_accepted_at is null from public.orders where id = '20000000-0000-0000-0000-0000000000a2') then
    raise exception 'teklif kapalıyken atama doğrudan olmalı'; end if;
end $$;
update public.ops_settings set offer_enabled = true where id = 1;
update public.orders set status = 'iptal' where id::text like '20000000-0000-0000-0000-0000000000a%' and status <> 'alindi';
update public.orders set status = 'sorunlu' where id = '20000000-0000-0000-0000-0000000000a1';
update public.orders set status = 'iptal' where id = '20000000-0000-0000-0000-0000000000a1';
update public.couriers set is_on_shift = false where id in (:kurye, :kurye2);
\echo '  9E_job_offers.test.sql: tüm kontroller geçti'
