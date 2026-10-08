-- Kurumsal API: anahtar kullanıcısı, webhook kuyruğu, dış referans, API ile iptal
reset role;
insert into public.corporate_accounts (id, company_name) values ('2a000000-0000-0000-0000-000000000001', 'API AŞ'), ('2a000000-0000-0000-0000-000000000002', 'Başka AŞ');
update public.profiles set corporate_account_id = '2a000000-0000-0000-0000-000000000001' where id = '00000000-0000-0000-0000-0000000000c1';

do $$
begin
  -- Hesaba bağlı olmayan kullanıcıyla anahtar açılamaz
  begin
    insert into public.api_keys (corporate_account_id, profile_id, name, key_prefix, key_hash)
    values ('2a000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'x', 'yk_live_', 'h0');
    raise exception 'başka hesabın kullanıcısıyla anahtar açılmamalı';
  exception when sqlstate '22023' then null;
  end;
end $$;
insert into public.api_keys (id, corporate_account_id, profile_id, name, key_prefix, key_hash)
values ('30000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'ERP', 'yk_live_ab', 'hash1');

insert into public.corporate_webhooks (corporate_account_id, url, secret)
values ('2a000000-0000-0000-0000-000000000001', 'https://ornek.com/kurye-webhook', 'whsec_0123456789abcdef01234567');

insert into public.orders (
  id, customer_id, corporate_account_id, external_ref, api_key_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus, payment_method
) values (
  '10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '2a000000-0000-0000-0000-000000000001', 'ERP-42',
  '30000000-0000-0000-0000-000000000001', 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1, 'cari'
);

do $$
declare d public.webhook_deliveries; r text;
begin
  if (select count(*) from public.webhook_deliveries where event = 'order.created') <> 1 then raise exception 'oluşturma olayı kuyruğa girmeli'; end if;
  -- Aynı dış referansla ikinci sipariş engellenir
  begin
    insert into public.orders (customer_id, corporate_account_id, external_ref, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus, payment_method)
    values ('00000000-0000-0000-0000-0000000000c1', '2a000000-0000-0000-0000-000000000001', 'ERP-42', 'A', 41, 29, 'B', 41, 29, 1000, '{}', 1, 0, 1, 'cari');
    raise exception 'aynı dış referans engellenmeli';
  exception when unique_violation then null;
  end;
  -- Başka hesap iptal edemez; kendi hesabı edebilir
  if public.api_cancel_order('10000000-0000-0000-0000-0000000000a1', '2a000000-0000-0000-0000-000000000002', 'x') <> 'not_found' then raise exception 'başka hesap iptal edememeli'; end if;
  r := public.api_cancel_order('10000000-0000-0000-0000-0000000000a1', '2a000000-0000-0000-0000-000000000001', 'Müşteri vazgeçti');
  if r <> 'ok' then raise exception 'iptal başarılı olmalı: %', r; end if;
  if (select cancel_reason from public.orders where id = '10000000-0000-0000-0000-0000000000a1') <> 'Müşteri vazgeçti' then raise exception 'iptal nedeni yazılmalı'; end if;
  if public.api_cancel_order('10000000-0000-0000-0000-0000000000a1', '2a000000-0000-0000-0000-000000000001', 'x') <> 'not_cancellable' then raise exception 'iptal edilmiş sipariş tekrar iptal edilemez'; end if;
  if (select payload->'order'->>'previous_status' from public.webhook_deliveries where event = 'order.status_changed') <> 'beklemede' then
    raise exception 'durum değişikliği olayı önceki durumu taşımalı';
  end if;
  -- Gönderici kuyruğu kilitleyerek alır
  if (select count(*) from public.claim_webhook_deliveries(10)) <> 2 then raise exception 'iki olay alınmalı'; end if;
  if (select count(*) from public.claim_webhook_deliveries(10)) <> 0 then raise exception 'kilitli olaylar tekrar alınmamalı'; end if;
end $$;

-- Üye (kurumsal kullanıcı) API anahtarlarını ve webhook gizli anahtarını göremez
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.api_keys) <> 0 then raise exception 'üye anahtarları görmemeli'; end if;
  if (select count(*) from public.corporate_webhooks) <> 0 then raise exception 'üye webhook gizli anahtarını görmemeli'; end if;
  begin
    perform public.api_cancel_order('10000000-0000-0000-0000-0000000000a1', '2a000000-0000-0000-0000-000000000001', 'x');
    raise exception 'authenticated api_cancel_order çağıramamalı';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo '  95_corporate_api.test.sql: tüm kontroller geçti'
