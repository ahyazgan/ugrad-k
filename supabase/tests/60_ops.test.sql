-- Ödenmemiş kart siparişi otomatik iptali
insert into public.orders (
  id, customer_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus, payment_method, created_at
) values
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000c1', 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1, 'kart', now() - interval '40 minutes'),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000c1', 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1, 'kart', now() - interval '10 minutes'),
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000c1', 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1, 'nakit', now() - interval '40 minutes');

do $$
declare n int;
begin
  n := public.cancel_unpaid_card_orders();
  if n <> 1 then raise exception 'yalnızca süresi dolan kart siparişi iptal edilmeli, %', n; end if;
  if (select status from public.orders where id = '10000000-0000-0000-0000-000000000006') <> 'iptal' then raise exception 'eski kart siparişi iptal olmalı'; end if;
  if (select status from public.orders where id = '10000000-0000-0000-0000-000000000007') <> 'beklemede' then raise exception 'yeni kart siparişi beklemeli'; end if;
  if (select status from public.orders where id = '10000000-0000-0000-0000-000000000008') <> 'beklemede' then raise exception 'nakit sipariş etkilenmemeli'; end if;
  if (select note from public.order_status_history where order_id = '10000000-0000-0000-0000-000000000006' and to_status = 'iptal') <> 'Ödeme süresi doldu (otomatik iptal)' then
    raise exception 'iptal notu geçmişe yazılmalı';
  end if;
  if not exists (select 1 from public.notifications where order_id = '10000000-0000-0000-0000-000000000006' and event = 'iptal') then
    raise exception 'müşteriye iptal bildirimi kuyruğa girmeli';
  end if;
end $$;

-- Ayar değişikliği yalnız yönetici
update public.ops_settings set unpaid_card_timeout_minutes = 5;
do $$ begin
  if public.cancel_unpaid_card_orders() <> 1 then raise exception '5 dk ayarıyla 10 dk önceki sipariş iptal edilmeli'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
do $$
declare n int;
begin
  update public.ops_settings set auto_assign = false;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'müşteri ayar değiştirememeli'; end if;
  if (select count(*) from public.ops_settings) <> 1 then raise exception 'giriş yapmış kullanıcı ayarı okuyabilmeli'; end if;
end $$;
reset role;
\echo '  60_ops.test.sql: tüm kontroller geçti'
