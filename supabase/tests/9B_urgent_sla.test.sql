-- Acil teslim taahhüdü ve gecikme telafisi
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''

reset role;
insert into public.orders (
  id, customer_id, courier_id, status, service_level, payment_method, created_at, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus, pod_photo_path
) values
  ('10000000-0000-0000-0000-0000000000f1', :cust1, :kurye, 'yolda', 'acil', 'cari', now() - interval '90 minutes', 'A', 41, 29, 'B', 41, 29, 5000,
   '{"lines":[{"code":"base","label":"Açılış","amountKurus":35000},{"code":"urgent","label":"Acil","amountKurus":20000}]}', 60000, 12000, 72000, 'x/f.jpg'),
  ('10000000-0000-0000-0000-0000000000f2', :cust1, :kurye, 'yolda', 'acil', 'cari', now() - interval '10 minutes', 'A', 41, 29, 'B', 41, 29, 5000,
   '{"lines":[{"code":"urgent","label":"Acil","amountKurus":20000}]}', 60000, 12000, 72000, 'x/f.jpg'),
  ('10000000-0000-0000-0000-0000000000f3', :cust1, null, 'beklemede', 'standart', 'kart', now(), 'A', 41, 29, 'B', 41, 29, 5000,
   '{}', 40000, 8000, 48000, null),
  ('10000000-0000-0000-0000-0000000000f4', :cust1, null, 'beklemede', 'acil', 'kart', now() - interval '30 minutes', 'A', 41, 29, 'B', 41, 29, 5000,
   '{}', 60000, 12000, 72000, null);

do $$ begin
  if (select sla_due_at from public.orders where id = '10000000-0000-0000-0000-0000000000f3') is not null then
    raise exception 'standart siparişte taahhüt olmamalı'; end if;
  if abs(extract(epoch from (select sla_due_at - created_at from public.orders where id = '10000000-0000-0000-0000-0000000000f1')) - 3600) > 1 then
    raise exception 'acil taahhüt 60 dk olmalı'; end if;
end $$;

-- Kartla ödemede saat ödemeyle başlar
update public.orders set payment_status = 'odendi', paid_at = now() where id = '10000000-0000-0000-0000-0000000000f4';
do $$ begin
  if (select sla_due_at from public.orders where id = '10000000-0000-0000-0000-0000000000f4') < now() + interval '59 minutes' then
    raise exception 'kart ödemesinden sonra taahhüt ödemeden başlamalı'; end if;
end $$;

-- Gecikmeli teslim → kredi; zamanında teslim → kredi yok
update public.orders set status = 'teslim_edildi' where id in ('10000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f2');
do $$ begin
  if not (select sla_missed from public.orders where id = '10000000-0000-0000-0000-0000000000f1') then raise exception 'gecikme işaretlenmeli'; end if;
  if (select sla_missed from public.orders where id = '10000000-0000-0000-0000-0000000000f2') then raise exception 'zamanında teslim gecikme sayıldı'; end if;
  if (select amount_kurus from public.customer_credits where source_order_id = '10000000-0000-0000-0000-0000000000f1') <> 20000 then
    raise exception 'acil ek ücreti kadar kredi yazılmalı'; end if;
  if exists (select 1 from public.customer_credits where source_order_id = '10000000-0000-0000-0000-0000000000f2') then
    raise exception 'zamanında teslimde kredi yazıldı'; end if;
  -- Teslimden sonra taahhüt zamanı değişmez
  update public.orders set scheduled_pickup_at = now() where id = '10000000-0000-0000-0000-0000000000f1';
  if (select sla_due_at > now() from public.orders where id = '10000000-0000-0000-0000-0000000000f1') then raise exception 'teslimden sonra taahhüt değişti'; end if;
end $$;

-- Müşteri kendi kredisini görür, başkası görmez; takip sayfası taahhüdü döner
select set_config('request.jwt.claim.sub', :cust1, false);
set role authenticated;
do $$ begin
  if (select count(*) from public.customer_credits) <> 1 then raise exception 'müşteri kredisini görmeli'; end if;
  -- Müşteri krediyi değiştiremez (RLS: yalnız okuma)
  update public.customer_credits set amount_kurus = 999999;
  if (select amount_kurus from public.customer_credits) <> 20000 then raise exception 'müşteri krediyi değiştirdi'; end if;
end $$;
reset role;
do $$
declare t jsonb;
begin
  t := public.get_tracking((select tracking_token from public.orders where id = '10000000-0000-0000-0000-0000000000f1'));
  if not (t ? 'sla_due_at') or (t ->> 'sla_missed')::boolean is not true then raise exception 'takipte taahhüt yok: %', t; end if;
end $$;
\echo '  9B_urgent_sla.test.sql: tüm kontroller geçti'
