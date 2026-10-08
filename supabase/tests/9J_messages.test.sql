-- Uygulama içi mesajlaşma: kim yazabilir/okuyabilir, yazışma penceresi, okundu, bildirim kuyruğu
\set admin  '''00000000-0000-0000-0000-00000000000a'''
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set kurye2 '''00000000-0000-0000-0000-00000000000d'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''
\set cust3  '''00000000-0000-0000-0000-0000000000c3'''

reset role;
insert into public.orders (
  id, customer_id, status, service_level, payment_method, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus
) values
  ('20000000-0000-0000-0000-0000000000e1', :cust1, 'onaylandi', 'standart', 'cari', 'A', 41, 29, 'B', 41, 29, 5000, '{}', 40000, 8000, 48000);

-- Kurye atanmadan yazışma kapalı
select set_config('request.jwt.claim.sub', :cust1, false);
set role authenticated;
do $$ begin
  perform public.send_order_message('20000000-0000-0000-0000-0000000000e1', 'Merhaba');
  raise exception 'atanmamış siparişte yazışma açık';
exception when sqlstate '22023' then null;
end $$;
reset role;
update public.orders set courier_id = :kurye, status = 'kuryeye_atandi' where id = '20000000-0000-0000-0000-0000000000e1';

select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
select (public.send_order_message('20000000-0000-0000-0000-0000000000e1', '  Kapıdayım  ')).body = 'Kapıdayım' as kurye_yazdi;
select set_config('request.jwt.claim.sub', :cust1, false);
select (public.send_order_message('20000000-0000-0000-0000-0000000000e1', 'Resepsiyona bırakabilirsiniz')).sender_role = 'musteri' as musteri_yazdi;
do $$ begin
  if (select count(*) from public.order_messages where order_id = '20000000-0000-0000-0000-0000000000e1') <> 2 then
    raise exception 'müşteri yazışmayı görmeli'; end if;
  if public.mark_messages_read('20000000-0000-0000-0000-0000000000e1') <> 1 then raise exception 'yalnız kuryenin mesajı okundu olmalı'; end if;
  begin
    perform public.send_order_message('20000000-0000-0000-0000-0000000000e1', repeat('x', 1001));
    raise exception 'uzun mesaj kabul edildi';
  exception when sqlstate '22023' then null;
  end;
end $$;
-- Başka müşteri ve başka kurye ne okuyabilir ne yazabilir
select set_config('request.jwt.claim.sub', :cust3, false);
do $$ begin
  if (select count(*) from public.order_messages where order_id = '20000000-0000-0000-0000-0000000000e1') <> 0 then
    raise exception 'başka müşteri yazışmayı gördü'; end if;
  perform public.send_order_message('20000000-0000-0000-0000-0000000000e1', 'selam');
  raise exception 'başka müşteri yazdı';
exception when insufficient_privilege then null;
end $$;
select set_config('request.jwt.claim.sub', :kurye2, false);
do $$ begin
  if (select count(*) from public.order_messages where order_id = '20000000-0000-0000-0000-0000000000e1') <> 0 then
    raise exception 'başka kurye yazışmayı gördü'; end if;
end $$;
-- Yönetici her zaman yazar; okuması müşteri adına okundu sayılmaz
select set_config('request.jwt.claim.sub', :admin, false);
select (public.send_order_message('20000000-0000-0000-0000-0000000000e1', 'Merhaba, yöneticiyiz')).sender_role = 'admin' as yonetici_yazdi;
do $$ begin
  if public.mark_messages_read('20000000-0000-0000-0000-0000000000e1') <> 0 then raise exception 'yönetici okuması işaretlememeli'; end if;
end $$;
reset role;

do $$ begin
  if not exists (select 1 from public.notifications where order_id = '20000000-0000-0000-0000-0000000000e1' and kind = 'mesaj_musteri') then
    raise exception 'müşteriye mesaj bildirimi kuyruğa girmeli'; end if;
  if not exists (select 1 from public.notifications where order_id = '20000000-0000-0000-0000-0000000000e1' and kind = 'mesaj_kurye') then
    raise exception 'kuryeye mesaj bildirimi kuyruğa girmeli'; end if;
end $$;

-- Tamamlandıktan 2 saat sonra kapanır; 90 günden eski mesajlar silinir
update public.orders set status = 'iptal' where id = '20000000-0000-0000-0000-0000000000e1';
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$ begin
  perform public.send_order_message('20000000-0000-0000-0000-0000000000e1', 'hâlâ orada mısınız');
  raise exception 'iptal siparişte yazışma açık';
exception when sqlstate '22023' then null;
end $$;
reset role;
update public.order_messages set created_at = now() - interval '91 days' where order_id = '20000000-0000-0000-0000-0000000000e1';
do $$ begin
  if public.purge_old_messages() <> 3 then raise exception 'eski mesajlar silinmeli'; end if;
end $$;
\echo '  9J_messages.test.sql: tüm kontroller geçti'
