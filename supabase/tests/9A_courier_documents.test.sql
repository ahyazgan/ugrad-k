-- Kurye belge ve uyum takibi
\set admin  '''00000000-0000-0000-0000-00000000000a'''
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set kurye2 '''00000000-0000-0000-0000-00000000000d'''

reset role;
do $$ begin
  if (select count(*) from public.courier_document_types where required) <> 4 then raise exception 'zorunlu belge sayısı 4 olmalı'; end if;
  if cardinality(public.courier_document_problems('00000000-0000-0000-0000-00000000000d')) <> 4 then
    raise exception 'belgesiz kuryede 4 sorun olmalı'; end if;
  if cardinality(public.courier_document_problems('00000000-0000-0000-0000-00000000000b')) <> 0 then
    raise exception 'belgeleri tam kuryede sorun olmamalı'; end if;
end $$;

-- Belgesi eksik kurye vardiyaya giremez
select set_config('request.jwt.claim.sub', :kurye2, false);
set role authenticated;
do $$ begin
  begin
    perform public.start_shift();
    raise exception 'belgesiz kurye vardiyaya girdi';
  exception when sqlstate '22023' then
    if sqlerrm not like '%Kurye faaliyet belgesi (eksik)%' then raise exception 'mesaj belge adını içermeli: %', sqlerrm; end if;
  end;
  -- Kurye kendi belgesini ekleyemez
  begin
    insert into public.courier_documents (courier_id, kind, expires_at) values (auth.uid(), 'ehliyet', '2035-01-01');
    raise exception 'kurye belge ekledi';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Yönetici belgeleri girer; biri dünden önce dolmuş
reset role;
insert into public.courier_documents (courier_id, kind, expires_at) values
  (:kurye2, 'ehliyet', '2035-01-01'), (:kurye2, 'kurye_faaliyet_belgesi', '2030-01-01'),
  (:kurye2, 'ruhsat', null), (:kurye2, 'trafik_sigortasi', (now() at time zone 'Europe/Istanbul')::date - 1);
select set_config('request.jwt.claim.sub', :kurye2, false);
set role authenticated;
do $$ begin
  if (select count(*) from public.courier_documents) <> 4 then raise exception 'kurye kendi belgelerini görmeli'; end if;
  begin
    perform public.start_shift();
    raise exception 'süresi dolmuş sigortayla vardiyaya girdi';
  exception when sqlstate '22023' then null;
  end;
end $$;

reset role;
-- Bugün biten belge bugün geçerli
update public.courier_documents set expires_at = (now() at time zone 'Europe/Istanbul')::date
  where courier_id = :kurye2 and kind = 'trafik_sigortasi';
do $$
declare h jsonb;
begin
  h := public.system_health();
  if (h ->> 'courier_docs_expiring')::int < 1 then raise exception 'yaklaşan belge sayılmalı: %', h; end if;
end $$;
select set_config('request.jwt.claim.sub', :kurye2, false);
set role authenticated;
select id is not null as vardiya_acildi from public.start_shift();
select public.end_shift();

-- Zorunluluk kapatılırsa belgesiz de girebilir
reset role;
delete from public.courier_documents where courier_id = :kurye2;
update public.ops_settings set enforce_courier_documents = false;
select set_config('request.jwt.claim.sub', :kurye2, false);
set role authenticated;
select id is not null as zorunluluk_kapali_vardiya from public.start_shift();
select public.end_shift();
reset role;
update public.ops_settings set enforce_courier_documents = true;
\echo '  9A_courier_documents.test.sql: tüm kontroller geçti'
