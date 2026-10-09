-- Kampanya, davet ve geri kazanma
\set admin  '''00000000-0000-0000-0000-00000000000a'''
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''
\set cust2  '''00000000-0000-0000-0000-0000000000c3'''

reset role;
insert into auth.users (id, phone, raw_user_meta_data) values (:cust2, '+905000000009', '{"full_name":"Deniz Davetli"}');

-- Davet kodu üretilir ve sabit kalır
select set_config('request.jwt.claim.sub', :cust1, false);
set role authenticated;
do $$
declare a text; b text;
begin
  a := public.my_referral_code();
  b := public.my_referral_code();
  if a !~ '^[A-Z2-9]{6}$' or a <> b then raise exception 'davet kodu hatalı: % %', a, b; end if;
  -- Müşteri kampanya kodlarını göremez
  if exists (select 1 from public.promo_codes) then raise exception 'müşteri kampanya kodlarını gördü'; end if;
end $$;

-- cust2, cust1 tarafından davet edildi; ilk teslimatında cust1'e ödül
reset role;
update public.profiles set referred_by = :cust1 where id = :cust2;
insert into public.orders (
  id, customer_id, courier_id, status, payment_method, pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus, promo_code
) values
  ('10000000-0000-0000-0000-0000000000c9', :cust2, :kurye, 'yolda', 'cari', 'A', 41, 29, 'B', 41, 29, 5000, '{}', 1, 0, 1, 'HOSGELDIN'),
  ('10000000-0000-0000-0000-0000000000ca', :cust2, :kurye, 'beklemede', 'cari', 'A', 41, 29, 'B', 41, 29, 5000, '{}', 1, 0, 1, 'HOSGELDIN');
insert into public.promo_codes (code, kind, value) values ('HOSGELDIN', 'yuzde', 20);
insert into public.promo_redemptions (code, kind, customer_id, order_id, amount_kurus)
values ('HOSGELDIN', 'kampanya', :cust2, '10000000-0000-0000-0000-0000000000ca', 1000);
update public.orders set status = 'teslim_edildi' where id = '10000000-0000-0000-0000-0000000000c9';
-- İptal edilen siparişin kod kullanımı silinir
update public.orders set status = 'iptal' where id = '10000000-0000-0000-0000-0000000000ca';
do $$ begin
  if (select amount_kurus from public.customer_credits where customer_id = '00000000-0000-0000-0000-0000000000c1'
        and source_order_id = '10000000-0000-0000-0000-0000000000c9') <> 10000 then
    raise exception 'davet ödülü yazılmalı'; end if;
  if exists (select 1 from public.promo_redemptions where order_id = '10000000-0000-0000-0000-0000000000ca') then
    raise exception 'iptalde kod kullanımı silinmeli'; end if;
  begin
    insert into public.promo_codes (code, kind, value) values ('kucuk', 'yuzde', 10);
    raise exception 'küçük harfli kod kabul edildi';
  exception when check_violation then null;
  end;
  begin
    insert into public.promo_codes (code, kind, value) values ('ASIRI', 'yuzde', 150);
    raise exception 'yüzde 100 üstü kabul edildi';
  exception when check_violation then null;
  end;
end $$;

-- Geri kazanma adayı: ticari ileti onayı + eski sipariş
insert into public.consents (profile_id, consent_type, granted, version)
values (:cust2, 'ticari_ileti', true, 'test');
update public.orders set created_at = now() - interval '45 days' where customer_id = :cust2;
do $$ begin
  if not exists (select 1 from public.winback_candidates(30) where id = '00000000-0000-0000-0000-0000000000c3') then
    raise exception 'geri kazanma adayı bulunmalı'; end if;
  if exists (select 1 from public.winback_candidates(30) where id = '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'ticari ileti onayı olmayan aday olmamalı'; end if;
end $$;
update public.profiles set last_winback_at = now() where id = :cust2;
do $$ begin
  if exists (select 1 from public.winback_candidates(30)) then raise exception 'yakın zamanda mesaj atılan aday olmamalı'; end if;
end $$;
\echo '  9D_growth.test.sql: tüm kontroller geçti'
