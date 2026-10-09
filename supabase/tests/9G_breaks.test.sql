-- Mola: bekleyen teklifler geri alınır; üst üste yanıtsız tekliflerde otomatik mola; vardiya bitince mola kapanır
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''

reset role;
update public.courier_shifts set ended_at = now() where courier_id = :kurye and ended_at is null;
update public.couriers set is_on_shift = false, on_break = false where id = :kurye;
insert into public.orders (
  id, customer_id, status, service_level, payment_method, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus
) values
  ('20000000-0000-0000-0000-0000000000c1', :cust1, 'onaylandi', 'standart', 'cari', 'A', 41, 29, 'B', 41, 29, 5000, '{}', 40000, 8000, 48000);

select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$ begin
  begin
    perform public.start_break();
    raise exception 'vardiya dışında mola verildi';
  exception when sqlstate '22023' then null;
  end;
  perform public.start_shift(41.0, 29.0);
end $$;
reset role;
select public.system_assign_courier('20000000-0000-0000-0000-0000000000c1', :kurye);

select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$
declare b1 uuid; b2 uuid;
begin
  b1 := (public.start_break()).id;
  b2 := (public.start_break()).id;
  if b1 <> b2 then raise exception 'ikinci mola açılmamalı'; end if;
end $$;
reset role;
do $$ begin
  if not (select on_break from public.couriers where id = '00000000-0000-0000-0000-00000000000b') then raise exception 'molada işaretlenmeli'; end if;
  if (select status from public.orders where id = '20000000-0000-0000-0000-0000000000c1') <> 'onaylandi' then
    raise exception 'molada bekleyen teklif geri alınmalı'; end if;
  if (select response || '/' || reason from public.courier_offers where order_id = '20000000-0000-0000-0000-0000000000c1') <> 'geri_alindi/Mola' then
    raise exception 'teklif mola nedeniyle geri alınmış görünmeli'; end if;
end $$;

select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
select (public.end_break()).ended_at is not null as mola_bitti;
reset role;

-- Üst üste 2 yanıtsız teklif → otomatik mola (moladan önceki teklifler sayılmaz)
update public.ops_settings set offer_auto_break_after = 2 where id = 1;
do $$ begin
  if exists (select public.auto_break_unresponsive()) then raise exception 'yanıtsız teklif yokken mola verildi'; end if;
end $$;
insert into public.courier_offers (order_id, courier_id, offered_at, expires_at, responded_at, response)
values
  ('20000000-0000-0000-0000-0000000000c1', :kurye, now() + interval '1 second', now() + interval '61 seconds', now() + interval '62 seconds', 'zaman_asimi'),
  ('20000000-0000-0000-0000-0000000000c1', :kurye, now() + interval '2 seconds', now() + interval '62 seconds', now() + interval '63 seconds', 'zaman_asimi');
do $$
declare ids uuid[];
begin
  ids := array(select public.auto_break_unresponsive());
  if ids <> array['00000000-0000-0000-0000-00000000000b'::uuid] then raise exception 'yanıtsız kurye molaya alınmalı: %', ids; end if;
  if not (select auto from public.courier_breaks where courier_id = '00000000-0000-0000-0000-00000000000b' and ended_at is null) then
    raise exception 'mola otomatik işaretlenmeli'; end if;
  -- Zaten moladaki kurye tekrar alınmaz
  if exists (select public.auto_break_unresponsive()) then raise exception 'moladaki kurye tekrar alındı'; end if;
end $$;
update public.ops_settings set offer_auto_break_after = 3 where id = 1;

-- Vardiya bitince mola kapanır
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
select (public.end_shift()).ended_at is not null as vardiya_bitti;
reset role;
do $$ begin
  if exists (select 1 from public.courier_breaks where courier_id = '00000000-0000-0000-0000-00000000000b' and ended_at is null) then
    raise exception 'vardiya bitince mola kapanmalı'; end if;
  if (select on_break or is_on_shift from public.couriers where id = '00000000-0000-0000-0000-00000000000b') then
    raise exception 'kurye bayrakları sıfırlanmalı'; end if;
  if (select count(*) from public.courier_breaks where courier_id = '00000000-0000-0000-0000-00000000000b') <> 2 then
    raise exception 'iki mola kaydı olmalı'; end if;
end $$;
update public.orders set status = 'iptal' where id = '20000000-0000-0000-0000-0000000000c1';
\echo '  9G_breaks.test.sql: tüm kontroller geçti'
