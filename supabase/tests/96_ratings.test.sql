-- Teslim sonrası değerlendirme
reset role;
insert into public.orders (
  id, customer_id, status, delivered_at, tracking_token, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus
) values
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'teslim_edildi', now() - interval '1 hour', 'r1' || repeat('x', 30), 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1),
  ('10000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', 'teslim_edildi', now() - interval '20 days', 'r2' || repeat('x', 30), 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1),
  ('10000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000c1', 'yolda', null, 'r3' || repeat('x', 30), 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1);

do $$
begin
  if (public.get_tracking('r1' || repeat('x', 30)) ->> 'can_rate')::boolean is not true then raise exception 'teslim edilen sipariş değerlendirilebilmeli'; end if;
  if public.submit_rating('r1' || repeat('x', 30), 2, '  Geç geldi  ') <> 'ok' then raise exception 'değerlendirme kaydedilmeli'; end if;
  if (select comment from public.order_ratings where order_id = '10000000-0000-0000-0000-0000000000b1') <> 'Geç geldi' then raise exception 'yorum kırpılmalı'; end if;
  if public.submit_rating('r1' || repeat('x', 30), 5) <> 'exists' then raise exception 'ikinci değerlendirme reddedilmeli'; end if;
  if (public.get_tracking('r1' || repeat('x', 30)) ->> 'rating')::int <> 2 then raise exception 'takipte puan görünmeli'; end if;
  if (public.get_tracking('r1' || repeat('x', 30)) ->> 'can_rate')::boolean then raise exception 'tekrar değerlendirme kapalı olmalı'; end if;
  if public.submit_rating('r2' || repeat('x', 30), 5) <> 'expired' then raise exception '14 günden eski reddedilmeli'; end if;
  if public.submit_rating('r3' || repeat('x', 30), 5) <> 'not_delivered' then raise exception 'teslim edilmeyen reddedilmeli'; end if;
  if public.submit_rating('kisa', 5) <> 'not_found' then raise exception 'geçersiz anahtar'; end if;
  begin
    perform public.submit_rating('r3' || repeat('x', 30), 6);
    raise exception 'puan aralığı kontrol edilmeli';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- Müşteri kendi değerlendirmesini görür, başkası göremez; anonim fonksiyonu çağıramaz
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
do $$ begin
  if (select count(*) from public.order_ratings) <> 1 then raise exception 'müşteri kendi değerlendirmesini görmeli'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
set role authenticated;
do $$ begin
  if (select count(*) from public.order_ratings) <> 0 then raise exception 'başka müşteri görmemeli'; end if;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform public.submit_rating('r1' || repeat('x', 30), 5);
    raise exception 'anon submit_rating çağıramamalı (site-api üzerinden)';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo '  96_ratings.test.sql: tüm kontroller geçti'
