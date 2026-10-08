-- Çevrimdışı kaydedilen işlemler: gerçekleştiği zaman kaydedilir, sınırlanır; eski konum son konumu ezmez
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''

reset role;
insert into public.orders (
  id, customer_id, status, service_level, payment_method, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus
) values
  ('20000000-0000-0000-0000-0000000000f1', :cust1, 'onaylandi', 'acil', 'cari', 'A', 41.0, 29.0, 'B', 41.05, 29.05, 7000, '{}', 40000, 8000, 48000);
update public.orders set courier_id = :kurye, status = 'kuryeye_atandi', created_at = now() - interval '2 hours'
 where id = '20000000-0000-0000-0000-0000000000f1';
update public.order_status_history set created_at = now() - interval '2 hours' where order_id = '20000000-0000-0000-0000-0000000000f1';

select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$
declare o public.orders; r jsonb;
begin
  r := public.mark_arrived('20000000-0000-0000-0000-0000000000f1', 'alis', 41.0001, 29.0001, now() - interval '50 minutes');
  o := public.set_order_status('20000000-0000-0000-0000-0000000000f1', 'alindi', null, 0, p_occurred_at => now() - interval '40 minutes');
  if abs(extract(epoch from o.picked_up_at - (now() - interval '40 minutes'))) > 2 then raise exception 'alış zamanı işlem anı olmalı: %', o.picked_up_at; end if;
  -- Bekleme varıştan alışa (10 dk) ölçülür, gönderim anına değil
  if o.waiting_minutes <> 10 then raise exception 'bekleme işlem anına göre ölçülmeli: %', o.waiting_minutes; end if;
  o := public.set_order_status('20000000-0000-0000-0000-0000000000f1', 'yolda', p_occurred_at => now() - interval '30 minutes');
  -- Önceki adımdan önceye gidemez: son geçmiş kaydına sabitlenir
  o := public.set_order_status('20000000-0000-0000-0000-0000000000f1', 'teslim_edildi', null, null, 'x/f.jpg', p_occurred_at => now() - interval '3 hours');
  if abs(extract(epoch from o.delivered_at - (now() - interval '30 minutes'))) > 2 then
    raise exception 'teslim zamanı önceki adımdan önce olamaz: %', o.delivered_at; end if;
  if o.completed_at <> o.delivered_at then raise exception 'tamamlanma teslim anı olmalı'; end if;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.order_status_history
       where order_id = '20000000-0000-0000-0000-0000000000f1' and created_at > now() - interval '25 minutes') <> 0 then
    raise exception 'geçmiş kayıtları işlem anıyla yazılmalı'; end if;
  if (select arrived_pickup_at from public.orders where id = '20000000-0000-0000-0000-0000000000f1') > now() - interval '49 minutes' then
    raise exception 'varış işlem anıyla yazılmalı'; end if;
  -- Bir sonraki çağrıya sızmaz
  if public.event_time() < now() then raise exception 'işlem zamanı sızdı'; end if;
end $$;

-- Konum: 6 saatten eski reddedilir; geç gelen eski konum son konumu ezmez
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
insert into public.courier_locations (courier_id, lat, lng, recorded_at) values (:kurye, 41.2, 29.2, now());
insert into public.courier_locations (courier_id, lat, lng, recorded_at) values (:kurye, 41.1, 29.1, now() - interval '20 minutes');
do $$ begin
  insert into public.courier_locations (courier_id, lat, lng, recorded_at) values ('00000000-0000-0000-0000-00000000000b', 41.0, 29.0, now() - interval '7 hours');
  raise exception '7 saatlik konum kabul edildi';
exception when sqlstate '22023' then null;
end $$;
reset role;
do $$ begin
  if (select last_lat from public.couriers where id = '00000000-0000-0000-0000-00000000000b') <> 41.2 then
    raise exception 'eski konum son konumu ezdi'; end if;
end $$;
\echo '  9K_offline_events.test.sql: tüm kontroller geçti'
