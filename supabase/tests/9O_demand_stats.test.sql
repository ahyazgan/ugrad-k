-- Talep yoğunluğu: hücre/saat toplama, iptal hariç, ilçe, kurye için az siparişli hücre gizli, erişim
\set admin  '''00000000-0000-0000-0000-00000000000a'''
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''

reset role;
-- 8 gün önce 10:00–10:50 (İstanbul) Kadıköy hücresinde 4 sipariş (biri iptal), Beykoz'da 1; tam hücre sınırında 1
insert into public.orders (
  id, customer_id, status, service_level, payment_method, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus, created_at
)
select ('20000000-0000-0000-0000-00000000030' || k)::uuid, :cust1, s::public.order_status, 'standart', 'cari', addr, lat, lng,
       'B', 41, 29, 5000, '{}', 40000, 8000, 48000,
       public.istanbul_ts((now() at time zone 'Europe/Istanbul')::date - 8, '10:00') + make_interval(mins => k * 10)
  from (values
    (1, 'teslim_edildi', 'Caferağa Mah., Moda Cad., Kadıköy/İstanbul', 40.9905, 29.0291),
    (2, 'teslim_edildi', 'Caferağa Mah., Kadıköy/İstanbul', 40.9912, 29.0300),
    (3, 'teslim_edildi', 'Osmanağa Mah., 34714 Kadıköy / İstanbul, Türkiye', 40.9921, 29.0262),
    (4, 'iptal', 'Caferağa Mah., Kadıköy/İstanbul', 40.9905, 29.0291),
    (5, 'teslim_edildi', 'Kılıçlı Mah. Şile Cad. No: 8A, Beykoz/İstanbul', 41.1338, 29.0931),
    (6, 'teslim_edildi', 'Sınır, Üsküdar/İstanbul', 41.02, 29.016)
  ) v(k, s, addr, lat, lng);

create temp table t_day as select extract(isodow from (now() at time zone 'Europe/Istanbul')::date - 8)::integer as wd;
grant select on t_day to authenticated;

select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
do $$
declare d jsonb := public.demand_stats(56); wd integer := (select wd from t_day); r jsonb;
begin
  if (d ->> 'weeks')::numeric < 1 then raise exception 'hafta en az 1 olmalı: %', d ->> 'weeks'; end if;
  select x into r from jsonb_array_elements(d -> 'rows') x
   where (x ->> 'weekday')::integer = wd and (x ->> 'hour')::integer = 10 and (x ->> 'lat')::numeric = 40.995 and (x ->> 'lng')::numeric = 29.0355;
  if r is null or (r ->> 'orders')::integer <> 2 or r ->> 'district' <> 'Kadıköy' then
    raise exception 'Kadıköy hücresi yanlış (iptal sayılmamalı): %', r; end if;
  -- 29.0262 bir önceki sütunda
  if not exists (select 1 from jsonb_array_elements(d -> 'rows') x where (x ->> 'lng')::numeric = 29.0225 and (x ->> 'lat')::numeric = 40.995
                   and (x ->> 'weekday')::integer = wd) then raise exception 'komşu hücre eksik'; end if;
  -- Tam sınırdaki nokta (41.02, 29.016) kayan nokta hatasız üst hücrede
  if not exists (select 1 from jsonb_array_elements(d -> 'rows') x where (x ->> 'lat')::numeric = 41.025 and (x ->> 'lng')::numeric = 29.0225
                   and x ->> 'district' = 'Üsküdar') then raise exception 'sınır hücresi yanlış'; end if;
end $$;

-- Kurye: 3'ten az siparişli hücreler görünmez
select set_config('request.jwt.claim.sub', :kurye, false);
do $$ begin
  if exists (select 1 from jsonb_array_elements(public.demand_stats() -> 'rows') x where (x ->> 'orders')::integer < 3) then
    raise exception 'kurye az siparişli hücre gördü'; end if;
end $$;
-- Müşteri göremez
select set_config('request.jwt.claim.sub', :cust1, false);
do $$ begin
  perform public.demand_stats();
  raise exception 'müşteri talep verisini gördü';
exception when insufficient_privilege then null;
end $$;
reset role;
delete from public.orders where id::text like '20000000-0000-0000-0000-00000000030_';
\echo '  9O_demand_stats.test.sql: tüm kontroller geçti'
