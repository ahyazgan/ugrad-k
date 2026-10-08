-- Fatura kuyruğu testleri (10_rls ve 20_notifications'tan sonra)
do $$ begin
  -- Sipariş 1 (bireysel) teslim edildi → 1 fatura; sipariş 3 de teslim edildi → 1 fatura
  if (select count(*) from public.invoices where kind = 'order') <> 2 then
    raise exception 'teslim edilen 2 bireysel sipariş için 2 fatura bekleniyordu: %', (select count(*) from public.invoices);
  end if;
  if (select total_kurus from public.invoices where order_id = '10000000-0000-0000-0000-000000000001') <> 85200 then
    raise exception 'fatura tutarı siparişle aynı olmalı';
  end if;
  if (select vat_pct from public.invoices where order_id = '10000000-0000-0000-0000-000000000001') <> 20 then
    raise exception 'KDV oranı 20 olmalı';
  end if;
  if (select buyer ->> 'name' from public.invoices where order_id = '10000000-0000-0000-0000-000000000001') <> 'Ayşe Yılmaz' then
    raise exception 'alıcı adı profilden alınmalı';
  end if;
end $$;

-- Kurumsal (cari) sipariş teslimi faturaya düşmez
insert into public.corporate_accounts (id, company_name) values ('20000000-0000-0000-0000-000000000001', 'Test A.Ş.');
insert into public.orders (
  id, customer_id, corporate_account_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  distance_meters, price_quote, subtotal_kurus, vat_kurus, total_kurus, status, courier_id, payment_method
) values ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-000000000001',
  'A', 41, 29, 'B', 41, 29, 1000, '{}', 1000, 200, 1200, 'yolda', '00000000-0000-0000-0000-00000000000b', 'cari');
update public.orders set status = 'teslim_edildi' where id = '10000000-0000-0000-0000-000000000005';
do $$ begin
  if exists (select 1 from public.invoices where order_id = '10000000-0000-0000-0000-000000000005') then
    raise exception 'cari sipariş tek tek faturalanmamalı';
  end if;
end $$;

-- Aylık fatura aynı dönem için bir kez
insert into public.invoices (kind, corporate_account_id, period, buyer, description, subtotal_kurus, vat_pct, vat_kurus, total_kurus)
values ('monthly', '20000000-0000-0000-0000-000000000001', '2026-10', '{}', 'Ekim', 1000, 20, 200, 1200);
do $$ begin
  insert into public.invoices (kind, corporate_account_id, period, buyer, description, subtotal_kurus, vat_pct, vat_kurus, total_kurus)
  values ('monthly', '20000000-0000-0000-0000-000000000001', '2026-10', '{}', 'Ekim', 1, 20, 0, 1);
  raise exception 'BEKLENMEDİ: aynı dönem iki kez faturalandı';
exception when unique_violation then null;
end $$;

-- Müşteri kendi faturasını görür, başkasınınkini görmez
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
set role authenticated;
do $$ begin
  if (select count(*) from public.invoices) <> 0 then raise exception 'başka müşteri faturaları görmemeli'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
do $$ begin
  if (select count(*) from public.invoices where kind = 'order') <> 2 then raise exception 'müşteri kendi faturalarını görmeli'; end if;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.claim_invoices(10)) <> 3 then raise exception 'claim 3 fatura vermeli'; end if;
  if exists (select 1 from public.claim_invoices(10)) then raise exception 'kilitli fatura tekrar verilmemeli'; end if;
end $$;
\echo '  30_invoices.test.sql: tüm kontroller geçti'
