-- RLS ve RPC davranış testleri. Her kontrol başarısızlıkta exception fırlatır.
-- Kullanıcı taklidi: request.jwt.claim.sub + role authenticated

\set admin  '''00000000-0000-0000-0000-00000000000a'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''
\set cust2  '''00000000-0000-0000-0000-0000000000c2'''
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set kurye2 '''00000000-0000-0000-0000-00000000000d'''

-- ───── Hazırlık (postgres olarak)
insert into auth.users (id, phone, raw_user_meta_data) values
  (:admin, '+905000000001', '{"full_name":"Yönetici"}'),
  (:cust1, '+905000000002', '{"full_name":"Ayşe Müşteri"}'),
  (:cust2, '+905000000003', '{"full_name":"Ali Başka"}'),
  (:kurye, '+905000000004', '{"full_name":"Mehmet Kurye"}'),
  (:kurye2, '+905000000005', '{"full_name":"Veli Kurye"}');

do $$ begin
  if (select count(*) from public.profiles) <> 5 then raise exception 'profil tetikleyicisi çalışmadı'; end if;
  if (select role from public.profiles where full_name = 'Ayşe Müşteri') <> 'musteri' then
    raise exception 'varsayılan rol musteri olmalı'; end if;
end $$;

update public.profiles set role = 'admin' where id = :admin;
update public.profiles set role = 'kurye' where id in (:kurye, :kurye2);
insert into public.couriers (id, plate) values (:kurye, '34 ABC 01'), (:kurye2, '34 ABC 02');

insert into public.orders (
  id, customer_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus
) values
  ('10000000-0000-0000-0000-000000000001', :cust1, 'Beykoz', 41.13, 29.10, 'Kadıköy', 40.99, 29.03,
   15000, '{}', 71000, 14200, 85200),
  ('10000000-0000-0000-0000-000000000002', :cust2, 'Üsküdar', 41.02, 29.01, 'Ataşehir', 40.99, 29.12,
   9000, '{}', 53000, 10600, 63600);

do $$ begin
  if (select order_no from public.orders where id = '10000000-0000-0000-0000-000000000001') not like 'YK-%' then
    raise exception 'sipariş numarası YK- ile başlamalı'; end if;
  if (select count(*) from public.order_status_history) <> 2 then
    raise exception 'oluşturma geçmişe yazılmalı'; end if;
  if (select count(*) from public.pricing_settings) <> 1 then raise exception 'seed fiyat ayarı yok'; end if;
end $$;

-- ───── Müşteri 1
select set_config('request.jwt.claim.sub', :cust1, false);
set role authenticated;

do $$ begin
  if (select count(*) from public.orders) <> 1 then raise exception 'müşteri yalnız kendi siparişini görmeli'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'müşteri yalnız kendi profilini görmeli'; end if;
  if (select count(*) from public.pricing_settings) <> 1 then raise exception 'fiyat ayarları okunabilmeli'; end if;
end $$;

do $$ begin
  insert into public.orders (customer_id, pickup_address, pickup_lat, pickup_lng, dropoff_address,
    dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus)
  values (auth.uid(), 'x', 0, 0, 'y', 0, 0, 1, '{}', 1, 0, 1);
  raise exception 'BEKLENMEDİ: müşteri doğrudan sipariş ekleyebildi';
exception when insufficient_privilege then null;
end $$;

do $$
declare n int;
begin
  update public.orders set total_kurus = 1 where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'müşteri fiyatı değiştirebildi'; end if;
end $$;

do $$ begin
  update public.profiles set role = 'admin' where id = auth.uid();
  raise exception 'BEKLENMEDİ: müşteri kendini yönetici yaptı';
exception when insufficient_privilege then null;
end $$;

update public.profiles set full_name = 'Ayşe Yılmaz' where id = auth.uid();

do $$ begin
  update public.pricing_settings set base_fee_kurus = 1;
  if (select base_fee_kurus from public.pricing_settings) = 1 then raise exception 'müşteri fiyat ayarını değiştirdi'; end if;
end $$;

insert into public.consents (profile_id, consent_type, version, granted)
values (auth.uid(), 'kvkk_aydinlatma', '2026-10', true), (auth.uid(), 'acik_riza_konum', '2026-10', true);

do $$ begin
  insert into public.consents (profile_id, consent_type, version, granted)
  values ('00000000-0000-0000-0000-0000000000c2', 'kvkk_aydinlatma', '2026-10', true);
  raise exception 'BEKLENMEDİ: başkası adına rıza eklendi';
exception when insufficient_privilege then null;
end $$;

reset role;

-- ───── Kurye atanmadan önce
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$ begin
  if (select count(*) from public.orders) <> 0 then raise exception 'atanmamış kurye siparişi görmemeli'; end if;
end $$;
do $$ begin
  perform public.set_order_status('10000000-0000-0000-0000-000000000001', 'alindi');
  raise exception 'BEKLENMEDİ: atanmamış kurye durum değiştirdi';
exception when insufficient_privilege then null;
end $$;
select id is not null as vardiya_acildi from public.start_shift(41.1, 29.1);
reset role;

-- ───── Yönetici atar
select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
do $$ begin
  if (select count(*) from public.orders) <> 2 then raise exception 'yönetici tüm siparişleri görmeli'; end if;
  if (public.assign_courier('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b')).status
     <> 'kuryeye_atandi' then raise exception 'atama başarısız'; end if;
end $$;
reset role;

-- ───── Müşteri atanmış siparişi kurye tarafından alındıktan sonra iptal edemez (önce kurye alsın)
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$ begin
  if (select count(*) from public.orders) <> 1 then raise exception 'kurye atandığı siparişi görmeli'; end if;
  perform public.set_order_status('10000000-0000-0000-0000-000000000001', 'teslim_edildi');
  raise exception 'BEKLENMEDİ: alınmadan teslim edildi';
exception when invalid_parameter_value then null;
end $$;

select status, waiting_minutes from public.set_order_status('10000000-0000-0000-0000-000000000001', 'alindi', p_waiting_minutes => 22);

insert into public.courier_locations (courier_id, order_id, lat, lng)
values (auth.uid(), '10000000-0000-0000-0000-000000000001', 41.05, 29.05);

do $$ begin
  insert into public.courier_locations (courier_id, order_id, lat, lng)
  values (auth.uid(), '10000000-0000-0000-0000-000000000002', 41.05, 29.05);
  raise exception 'BEKLENMEDİ: kurye başka siparişe konum yazdı';
exception when insufficient_privilege then null;
end $$;

insert into storage.objects (bucket_id, name) values ('pod', '10000000-0000-0000-0000-000000000001/foto.jpg');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('pod', '10000000-0000-0000-0000-000000000002/foto.jpg');
  raise exception 'BEKLENMEDİ: kurye başka siparişe dosya yükledi';
exception when insufficient_privilege then null;
end $$;

select status from public.set_order_status('10000000-0000-0000-0000-000000000001', 'yolda');
reset role;

-- ───── Müşteri canlı konumu görür, başkası görmez; yoldaki siparişi iptal edemez
select set_config('request.jwt.claim.sub', :cust1, false);
set role authenticated;
do $$ begin
  if (select count(*) from public.courier_locations) <> 1 then raise exception 'müşteri kurye konumunu görmeli'; end if;
  if (select count(*) from public.profiles) <> 2 then raise exception 'müşteri atanmış kuryenin profilini görmeli'; end if;
  if (select plate from public.couriers) <> '34 ABC 01' then raise exception 'müşteri atanmış kuryenin plakasını görmeli'; end if;
  perform public.set_order_status('10000000-0000-0000-0000-000000000001', 'iptal', 'vazgeçtim');
  raise exception 'BEKLENMEDİ: yoldaki sipariş iptal edildi';
exception when insufficient_privilege then null;
end $$;
reset role;

select set_config('request.jwt.claim.sub', :cust2, false);
set role authenticated;
do $$ begin
  if (select count(*) from public.courier_locations) <> 0 then raise exception 'başka müşteri konumu görmemeli'; end if;
  if (select count(*) from public.couriers) <> 0 then raise exception 'başka müşteri kuryeyi görmemeli'; end if;
  if (select count(*) from storage.objects) <> 0 then raise exception 'başka müşteri teslim fotoğrafını görmemeli'; end if;
  -- kendi beklemedeki siparişini açıklama ile iptal edebilir
  if (public.set_order_status('10000000-0000-0000-0000-000000000002', 'iptal', 'yanlış adres')).status <> 'iptal' then
    raise exception 'iptal başarısız'; end if;
end $$;
reset role;

-- ───── Kurye teslim eder
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$ begin
  perform public.set_order_status('10000000-0000-0000-0000-000000000001', 'teslim_edildi');
  raise exception 'BEKLENMEDİ: kanıtsız teslim';
exception when invalid_parameter_value then null;
end $$;
select status, delivered_at is not null as teslim_zamani from public.set_order_status(
  '10000000-0000-0000-0000-000000000001', 'teslim_edildi',
  p_pod_photo_path => '10000000-0000-0000-0000-000000000001/foto.jpg', p_pod_receiver_name => 'Resepsiyon');
select ended_at is not null as vardiya_kapandi from public.end_shift();
reset role;

-- ───── Yönetici: son durumdan geri dönülemez
select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
do $$ begin
  update public.orders set status = 'yolda' where id = '10000000-0000-0000-0000-000000000001';
  raise exception 'BEKLENMEDİ: teslim edilmiş sipariş geri alındı';
exception when invalid_parameter_value then null;
end $$;
do $$ begin
  update public.pricing_settings set bridge_fee_kurus = 6000;
  if (select count(*) from public.pricing_settings_history) < 2 then raise exception 'fiyat geçmişi tutulmalı'; end if;
end $$;
reset role;

-- ───── Herkese açık takip
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$
declare t jsonb;
begin
  select public.get_tracking(tracking_token) into t from (select null::text as tracking_token) x;
  if t is not null then raise exception 'boş token veri döndürmemeli'; end if;
end $$;
do $$ begin
  perform 1 from public.orders;
  if found then raise exception 'anon siparişleri görmemeli'; end if;
end $$;
reset role;

do $$
declare t jsonb; tok text;
begin
  select tracking_token into tok from public.orders where id = '10000000-0000-0000-0000-000000000001';
  set local role anon;
  t := public.get_tracking(tok);
  if t ->> 'status' <> 'teslim_edildi' then raise exception 'takip durumu yanlış: %', t; end if;
  if t ->> 'courier_first_name' <> 'Mehmet' then raise exception 'kurye adı yanlış'; end if;
  if t -> 'courier_location' <> 'null'::jsonb then raise exception 'teslimden sonra konum gizlenmeli'; end if;
  if jsonb_array_length(t -> 'history') <> 6 then raise exception 'geçmiş eksik: %', t -> 'history'; end if;
end $$;

-- Geçmişe not yazıldı mı?
do $$ begin
  if (select note from public.order_status_history
      where order_id = '10000000-0000-0000-0000-000000000002' and to_status = 'iptal') <> 'yanlış adres' then
    raise exception 'durum notu geçmişe yazılmadı'; end if;
  if (select count(*) from public.courier_shifts where ended_at is not null) <> 1 then
    raise exception 'vardiya kaydı yok'; end if;
end $$;

\echo '  rls.test.sql: tüm kontroller geçti'
