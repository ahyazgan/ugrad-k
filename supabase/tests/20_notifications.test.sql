-- Bildirim kuyruğu testleri (10_rls.test.sql'den sonra çalışır; oradaki siparişleri kullanır)
do $$
declare n int;
begin
  -- Sipariş 1: oluşturma + 5 durum değişikliği = 6 olay
  select count(*) into n from public.notifications where order_id = '10000000-0000-0000-0000-000000000001';
  if n <> 6 then raise exception 'sipariş 1 için 6 bildirim bekleniyordu, %', n; end if;
  if exists (select 1 from public.notifications where status <> 'pending') then
    raise exception 'yeni bildirimler pending olmalı';
  end if;
end $$;

-- claim: kilitler ve deneme sayısını artırır, ikinci çağrı aynı satırları vermez
do $$
declare a int; b int;
begin
  select count(*) into a from public.claim_notifications(5);
  select count(*) into b from public.claim_notifications(100);
  if a <> 5 then raise exception 'ilk claim 5 satır vermeli, %', a; end if;
  if (select count(*) from public.notifications where status = 'processing') <> a + b then
    raise exception 'claim edilenler processing olmalı';
  end if;
  if exists (select 1 from public.claim_notifications(10)) then
    raise exception 'kilitli satırlar tekrar verilmemeli';
  end if;
end $$;

-- Takılı kalan (10 dk+) işlem tekrar alınır
update public.notifications set locked_at = now() - interval '11 minutes' where id = (select min(id) from public.notifications);
do $$ begin
  if (select count(*) from public.claim_notifications(10)) <> 1 then raise exception 'takılı satır tekrar alınmalı'; end if;
end $$;

-- Yetkisiz roller claim çağıramaz
set role authenticated;
do $$ begin
  perform public.claim_notifications(1);
  raise exception 'BEKLENMEDİ: authenticated claim çağırdı';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Aynı olay tekrar yaşanırsa (onaylandi → sorunlu → onaylandi) yeniden kuyruğa girer
insert into public.orders (
  id, customer_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus
) values ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000c1', 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1);
update public.orders set status = 'onaylandi' where id = '10000000-0000-0000-0000-000000000004';
update public.notifications set status = 'sent', attempts = 1 where order_id = '10000000-0000-0000-0000-000000000004';
update public.orders set status = 'sorunlu' where id = '10000000-0000-0000-0000-000000000004';
update public.orders set status = 'onaylandi' where id = '10000000-0000-0000-0000-000000000004';
do $$ begin
  if (select status from public.notifications where order_id = '10000000-0000-0000-0000-000000000004' and event = 'onaylandi') <> 'pending' then
    raise exception 'tekrarlanan olay yeniden pending olmalı';
  end if;
  if (select attempts from public.notifications where order_id = '10000000-0000-0000-0000-000000000004' and event = 'onaylandi') <> 0 then
    raise exception 'deneme sayısı sıfırlanmalı';
  end if;
end $$;
\echo '  20_notifications.test.sql: tüm kontroller geçti'
