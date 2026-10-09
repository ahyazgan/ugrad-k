-- Teslim edilemedi → göndericiye iade: kurallar (varış, bekleme, arama, kanıt), iade teslimi, hakediş ve fatura
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''

reset role;
insert into public.orders (
  id, customer_id, status, service_level, payment_method, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus
) values
  ('20000000-0000-0000-0000-0000000000d1', :cust1, 'onaylandi', 'standart', 'cari', 'A', 41, 29, 'B', 41.05, 29.05, 7000, '{}', 40000, 8000, 48000),
  ('20000000-0000-0000-0000-0000000000d2', :cust1, 'onaylandi', 'standart', 'cari', 'A', 41, 29, 'B', 41.05, 29.05, 7000, '{}', 40000, 8000, 48000);
update public.orders set courier_id = :kurye, status = 'kuryeye_atandi' where id::text like '20000000-0000-0000-0000-0000000000d_';
update public.orders set status = 'alindi' where id::text like '20000000-0000-0000-0000-0000000000d_';
update public.orders set status = 'yolda' where id::text like '20000000-0000-0000-0000-0000000000d_';

select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$
  declare d1 uuid := '20000000-0000-0000-0000-0000000000d1';
begin
  -- Varış bildirilmeden "alıcı yok" denemez
  begin
    perform public.report_failed_delivery(d1, 'alici_yok', null, 'd1/kapi.jpg', 2);
    raise exception 'varışsız iade açıldı';
  exception when sqlstate '22023' then
    if sqlerrm not like 'Önce teslim adresine%' then raise; end if;
  end;
end $$;
reset role;
update public.orders set arrived_dropoff_at = now() - interval '3 minutes' where id = '20000000-0000-0000-0000-0000000000d1';
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$ begin
  begin
    perform public.report_failed_delivery('20000000-0000-0000-0000-0000000000d1', 'alici_yok', null, 'd1/kapi.jpg', 2);
    raise exception '10 dk beklemeden iade açıldı';
  exception when sqlstate '22023' then
    if sqlerrm not like 'Alıcıyı en az 10 dakika bekleyin (7 dk kaldı)' then raise; end if;
  end;
end $$;
reset role;
update public.orders set arrived_dropoff_at = now() - interval '12 minutes' where id = '20000000-0000-0000-0000-0000000000d1';
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$
declare o public.orders;
begin
  begin
    perform public.report_failed_delivery('20000000-0000-0000-0000-0000000000d1', 'alici_yok', null, 'd1/kapi.jpg', 0);
    raise exception 'aramadan iade açıldı';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.report_failed_delivery('20000000-0000-0000-0000-0000000000d1', 'alici_yok', null, '  ', 2);
    raise exception 'fotoğrafsız iade açıldı';
  exception when sqlstate '22023' then null;
  end;
  o := public.report_failed_delivery('20000000-0000-0000-0000-0000000000d1', 'alici_yok', 'Kapı kapalı, telefon kapalı', 'd1/kapi.jpg', 2);
  if o.status <> 'geri_donuyor' or o.failed_call_attempts <> 2 or o.failed_at is null then raise exception 'iade başlamadı: %', o.status; end if;
  -- Alıcı reddettiyse bekleme şartı yok
  o := public.report_failed_delivery('20000000-0000-0000-0000-0000000000d2', 'alici_reddetti', 'Paketi istemedi', 'd2/kapi.jpg', 0);
  if o.status <> 'geri_donuyor' then raise exception 'ret ile iade başlamadı'; end if;
  -- İade teslimi kanıtsız kapanmaz; kanıtla kapanır, teslim kanıtına yazılmaz
  begin
    perform public.set_order_status('20000000-0000-0000-0000-0000000000d1', 'geri_teslim');
    raise exception 'kanıtsız iade kapandı';
  exception when sqlstate '22023' then null;
  end;
  o := public.set_order_status('20000000-0000-0000-0000-0000000000d1', 'geri_teslim', null, null, 'd1/iade.jpg', null, 'Ayşe (gönderen)');
  if o.status <> 'geri_teslim' or o.returned_at is null or o.completed_at is null then raise exception 'iade kapanmadı'; end if;
  if o.return_pod_photo_path <> 'd1/iade.jpg' or o.return_receiver_name <> 'Ayşe (gönderen)' or o.pod_photo_path is not null then
    raise exception 'iade kanıtı ayrı alanlara yazılmalı'; end if;
  if o.delivered_at is not null then raise exception 'iade teslim sayılmamalı'; end if;
end $$;
reset role;

do $$ begin
  if not public.is_active_delivery_status('geri_donuyor') then raise exception 'iade sırasında konum görünmeli'; end if;
  if not exists (select 1 from public.pending_courier_earnings() p where p.id = '20000000-0000-0000-0000-0000000000d1') then
    raise exception 'iade edilen işte kurye hakedişi doğmalı'; end if;
  if (select description from public.invoices where order_id = '20000000-0000-0000-0000-0000000000d1') not like '%(teslim edilemedi, iade)' then
    raise exception 'iade faturası açılmalı'; end if;
  if (select note from public.order_status_history where order_id = '20000000-0000-0000-0000-0000000000d1' and to_status = 'geri_donuyor')
     <> 'Teslim edilemedi: alici_yok — Kapı kapalı, telefon kapalı' then raise exception 'geçmişe neden yazılmalı'; end if;
end $$;
update public.orders set status = 'sorunlu' where id = '20000000-0000-0000-0000-0000000000d2';
update public.orders set status = 'iptal' where id = '20000000-0000-0000-0000-0000000000d2';
\echo '  9I_failed_delivery.test.sql: tüm kontroller geçti'
