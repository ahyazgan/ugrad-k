-- Hesap silme: aktif siparişte engel, aksi halde anonimleştirme
do $$ begin
  -- müşteri 1'in sipariş 4'ü 'onaylandi' durumunda (20_notifications) → engellenmeli
  perform public.anonymize_profile('00000000-0000-0000-0000-0000000000c1');
  raise exception 'BEKLENMEDİ: aktif siparişi olan hesap silindi';
exception when invalid_parameter_value then null;
end $$;

do $$
declare tok_before text; tok_after text;
begin
  select tracking_token into tok_before from public.orders where id = '10000000-0000-0000-0000-000000000002';
  perform public.anonymize_profile('00000000-0000-0000-0000-0000000000c2');
  if (select phone from public.profiles where id = '00000000-0000-0000-0000-0000000000c2') is not null then
    raise exception 'telefon silinmeli';
  end if;
  if (select deleted_at from public.profiles where id = '00000000-0000-0000-0000-0000000000c2') is null then
    raise exception 'deleted_at işaretlenmeli';
  end if;
  if not exists (select 1 from public.orders where id = '10000000-0000-0000-0000-000000000002') then
    raise exception 'siparişler saklanmalı';
  end if;
  select tracking_token into tok_after from public.orders where id = '10000000-0000-0000-0000-000000000002';
  if tok_before = tok_after then raise exception 'takip bağlantısı geçersizleşmeli'; end if;
end $$;

set role authenticated;
do $$ begin
  perform public.anonymize_profile('00000000-0000-0000-0000-0000000000c2');
  raise exception 'BEKLENMEDİ: kullanıcı doğrudan çağırdı';
exception when insufficient_privilege then null;
end $$;
reset role;
\echo '  50_account_deletion.test.sql: tüm kontroller geçti'
