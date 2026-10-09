-- Adrese varış: elle (mesafe kontrolü) ve konumdan otomatik; bekleme ölçümü; varış bildirimleri
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''

reset role;
insert into public.orders (
  id, customer_id, status, service_level, payment_method, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus, pod_photo_path
) values
  ('20000000-0000-0000-0000-0000000000b1', :cust1, 'onaylandi', 'standart', 'cari', 'A', 41.0, 29.0, 'B', 41.05, 29.05, 7000, '{}', 40000, 8000, 48000, 'x/f.jpg'),
  ('20000000-0000-0000-0000-0000000000b2', :cust1, 'onaylandi', 'standart', 'cari', 'A', 41.0, 29.0, 'B', 41.05, 29.05, 7000, '{}', 40000, 8000, 48000, 'x/f.jpg');
update public.orders set courier_id = :kurye, status = 'kuryeye_atandi' where id in ('20000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b2');

do $$ begin
  if public.distance_m(41.0, 29.0, 41.0, 29.001) not between 80 and 90 then raise exception 'mesafe hesabı yanlış'; end if;
end $$;

select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$
declare r jsonb;
begin
  -- Uzaktan "vardım" denemez
  begin
    perform public.mark_arrived('20000000-0000-0000-0000-0000000000b1', 'alis', 41.01, 29.0);
    raise exception 'uzaktan varış kabul edildi';
  exception when sqlstate '22023' then
    if sqlerrm not like 'Adrese henüz varmadınız%' then raise; end if;
  end;
  -- Teslim adresine paket alınmadan varılmaz
  begin
    perform public.mark_arrived('20000000-0000-0000-0000-0000000000b1', 'teslim', 41.05, 29.05);
    raise exception 'paket alınmadan teslim varışı kabul edildi';
  exception when sqlstate '22023' then null;
  end;
  r := public.mark_arrived('20000000-0000-0000-0000-0000000000b1', 'alis', 41.0005, 29.0005);
  if not (r ->> 'ok')::boolean then raise exception 'varış kaydedilmedi'; end if;
end $$;
reset role;

do $$ begin
  if (select arrived_pickup_at from public.orders where id = '20000000-0000-0000-0000-0000000000b1') is null then
    raise exception 'varış zamanı yazılmadı'; end if;
  if not exists (select 1 from public.notifications where order_id = '20000000-0000-0000-0000-0000000000b1' and kind = 'varis_alis' and status = 'pending') then
    raise exception 'alış varış bildirimi kuyruğa girmeli'; end if;
end $$;

-- Bekleme: 20 dk önce varıldı → kurye ne girerse girsin 20 dk ölçülür
update public.orders set arrived_pickup_at = now() - interval '20 minutes 30 seconds' where id = '20000000-0000-0000-0000-0000000000b1';
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
select public.set_order_status('20000000-0000-0000-0000-0000000000b1', 'alindi', null, 99) is not null;
-- Varış bildirilmeyen işte kuryenin girdiği süre "elle" kaydedilir
select public.set_order_status('20000000-0000-0000-0000-0000000000b2', 'alindi', null, 12) is not null;
select public.set_order_status('20000000-0000-0000-0000-0000000000b1', 'yolda') is not null;
-- Konum teslim adresine 50 m'ye girince otomatik varış (doğruluğu kötü konum sayılmaz)
insert into public.courier_locations (courier_id, order_id, lat, lng, accuracy_m)
values (:kurye, '20000000-0000-0000-0000-0000000000b1', 41.0503, 29.0503, 250);
reset role;
do $$ begin
  if (select waiting_minutes || '/' || waiting_source from public.orders where id = '20000000-0000-0000-0000-0000000000b1') <> '20/olcum' then
    raise exception 'bekleme ölçülmeli: %', (select waiting_minutes || '/' || waiting_source from public.orders where id = '20000000-0000-0000-0000-0000000000b1'); end if;
  if (select waiting_minutes || '/' || waiting_source from public.orders where id = '20000000-0000-0000-0000-0000000000b2') <> '12/elle' then
    raise exception 'elle bekleme kaydedilmeli'; end if;
  if (select arrived_dropoff_at from public.orders where id = '20000000-0000-0000-0000-0000000000b1') is not null then
    raise exception 'doğruluğu kötü konumla varış sayıldı'; end if;
end $$;
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
insert into public.courier_locations (courier_id, order_id, lat, lng, accuracy_m)
values (:kurye, '20000000-0000-0000-0000-0000000000b1', 41.0503, 29.0503, 12);
reset role;
do $$ begin
  if (select arrived_dropoff_at from public.orders where id = '20000000-0000-0000-0000-0000000000b1') is null then
    raise exception 'teslim adresine otomatik varış sayılmalı'; end if;
  if not exists (select 1 from public.notifications where order_id = '20000000-0000-0000-0000-0000000000b1' and kind = 'varis_teslim' and event = 'yolda') then
    raise exception 'teslim varış bildirimi kuyruğa girmeli'; end if;
  -- Durum bildirimleri ayrı kalır
  if not exists (select 1 from public.notifications where order_id = '20000000-0000-0000-0000-0000000000b1' and kind = 'durum' and event = 'yolda') then
    raise exception 'durum bildirimi bozuldu'; end if;
end $$;
update public.orders set status = 'sorunlu' where id in ('20000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b2');
update public.orders set status = 'iptal' where id in ('20000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b2');
\echo '  9F_arrivals.test.sql: tüm kontroller geçti'
