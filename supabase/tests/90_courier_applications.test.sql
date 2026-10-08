-- Kurye başvuruları: yalnız yönetici görür; aynı numaradan ikinci açık başvuru engellenir
reset role;
insert into public.courier_applications (full_name, phone, kvkk_consent_at) values ('Can Kurye', '+905551112233', now());
do $$
begin
  begin
    insert into public.courier_applications (full_name, phone, kvkk_consent_at) values ('Can Kurye', '+905551112233', now());
    raise exception 'aynı numaradan ikinci açık başvuru engellenmeli';
  exception when unique_violation then null;
  end;
  if (select file_size_limit from storage.buckets where id = 'basvuru') <> 5242880 then raise exception 'belge boyut sınırı 5 MB olmalı'; end if;
end $$;
-- Reddedilen başvurudan sonra yeniden başvurulabilir
update public.courier_applications set status = 'reddedildi';
insert into public.courier_applications (full_name, phone, kvkk_consent_at) values ('Can Kurye', '+905551112233', now());

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.courier_applications) <> 0 then raise exception 'müşteri başvuruları görmemeli'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.courier_applications) <> 2 then raise exception 'yönetici başvuruları görmeli'; end if;
end $$;
reset role;
\echo '  90_courier_applications.test.sql: tüm kontroller geçti'
