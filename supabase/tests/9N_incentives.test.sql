-- Hedef primleri: kademeli hedef ve yüzde primi; dönem kapanınca ödül, hesaplaşmaya dahil
\set admin  '''00000000-0000-0000-0000-00000000000a'''
\set kurye2 '''00000000-0000-0000-0000-00000000000d'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''

reset role;
-- Dün (İstanbul) 10:00, 11:00, 21:00'de üç iş; her birinin hakedişi 200 TL
insert into public.orders (
  id, customer_id, courier_id, status, service_level, payment_method, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus, delivered_at, completed_at
)
select ('20000000-0000-0000-0000-00000000010' || k)::uuid, :cust1, :kurye2, 'teslim_edildi', 'standart', 'cari', 'A', 41, 29, 'B', 41, 29, 5000, '{}', 40000, 8000, 48000,
       public.istanbul_ts((now() at time zone 'Europe/Istanbul')::date - 1, h), public.istanbul_ts((now() at time zone 'Europe/Istanbul')::date - 1, h)
  from (values (1, '10:00'::time), (2, '11:00'::time), (3, '21:00'::time)) v(k, h);
insert into public.courier_earnings (order_id, courier_id, delivered_at, km, job_kurus, km_kurus, bonus_kurus, waiting_kurus, bridge_kurus, total_kurus)
select id, courier_id, delivered_at, 5, 15000, 5000, 0, 0, 0, 20000 from public.orders where id::text like '20000000-0000-0000-0000-00000000010_';

insert into public.courier_incentives (id, title, kind, period, tiers, starts_on)
values ('20000000-0000-0000-0000-000000000201', 'Günde 2 iş 100 TL, 3 iş 250 TL', 'hedef', 'gunluk',
        '[{"target": 2, "rewardKurus": 10000}, {"target": 3, "rewardKurus": 25000}]', (now() at time zone 'Europe/Istanbul')::date - 3);
-- Yalnız dün, 08–20 arası işlerde %10
insert into public.courier_incentives (id, title, kind, period, bonus_pct, start_hour, end_hour, starts_on, ends_on)
values ('20000000-0000-0000-0000-000000000202', 'Dün gündüz %10', 'yuzde', 'gunluk', 10, 8, 20,
        (now() at time zone 'Europe/Istanbul')::date - 1, (now() at time zone 'Europe/Istanbul')::date - 1);

do $$ begin
  if public.compute_incentive_awards() < 2 then raise exception 'iki ödül yazılmalı'; end if;
  if (select amount_kurus from public.courier_incentive_awards where incentive_id = '20000000-0000-0000-0000-000000000201'
        and courier_id = '00000000-0000-0000-0000-00000000000d') <> 25000 then raise exception 'en yüksek kademe ödenmeli'; end if;
  -- 21:00 işi saat aralığı dışında: 2 iş × 200 TL × %10
  if (select amount_kurus from public.courier_incentive_awards where incentive_id = '20000000-0000-0000-0000-000000000202') <> 4000 then
    raise exception 'yüzde primi saat aralığıyla hesaplanmalı'; end if;
  if (select detail from public.courier_incentive_awards where incentive_id = '20000000-0000-0000-0000-000000000202') <> '2 iş, hakediş 400,00 TL × %10' then
    raise exception 'ödül açıklaması yanlış'; end if;
  if public.compute_incentive_awards() <> 0 then raise exception 'tekrar çalışınca yeni ödül yazılmamalı'; end if;
end $$;

-- Kurye ilerlemesi: bugünün hedef kampanyası (dünkü yüzde kampanyası bitti)
select set_config('request.jwt.claim.sub', :kurye2, false);
set role authenticated;
do $$ begin
  if (select count(*) from public.my_incentive_progress()) <> 1 then raise exception 'bugün geçerli tek kampanya görünmeli'; end if;
  -- Önceki testlerin bugünkü işleri de sayılır
  if (select jobs from public.my_incentive_progress()) <> (select count(*) from public.orders
        where courier_id = '00000000-0000-0000-0000-00000000000d' and status in ('teslim_edildi', 'geri_teslim')
          and completed_at >= public.istanbul_ts((now() at time zone 'Europe/Istanbul')::date, '00:00')) then
    raise exception 'bugünün iş sayısı yanlış'; end if;
  if (select count(*) from public.courier_incentive_awards) <> 2 then raise exception 'kurye kendi ödüllerini görmeli'; end if;
end $$;

-- Hesaplaşma primleri içerir; iptal geri açar
select set_config('request.jwt.claim.sub', :admin, false);
do $$
declare p public.courier_payouts;
begin
  p := public.create_courier_payout('00000000-0000-0000-0000-00000000000d');
  if p.incentive_kurus <> 29000 or p.net_kurus <> p.earnings_kurus + 29000 - p.cash_kurus then raise exception 'prim hesaplaşmaya girmeli: %', p; end if;
  perform public.cancel_courier_payout(p.id);
  if exists (select 1 from public.courier_incentive_awards where payout_id is not null) then raise exception 'iptalde primler geri açılmalı'; end if;
end $$;
reset role;
update public.courier_incentives set active = false;
\echo '  9N_incentives.test.sql: tüm kontroller geçti'
