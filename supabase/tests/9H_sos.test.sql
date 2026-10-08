-- Acil durum: alarm kaydı, tekrar basışta tek kayıt, kurye molaya alınır; yönetici görür ve kapatır
\set admin  '''00000000-0000-0000-0000-00000000000a'''
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set kurye2 '''00000000-0000-0000-0000-00000000000d'''

reset role;
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
select (public.start_shift(41.0, 29.0)).id is not null as vardiya;
-- Kurye alarmı doğrudan açamaz (yalnız sos Edge Function'ı, servis rolü)
do $$ begin
  perform public.raise_sos('00000000-0000-0000-0000-00000000000b', 'kaza');
  raise exception 'kurye raise_sos çağırabildi';
exception when insufficient_privilege then null;
end $$;
reset role;

do $$
declare a uuid; b uuid;
begin
  a := (public.raise_sos('00000000-0000-0000-0000-00000000000b', 'kaza', 41.01, 29.02, 8, 'Sarıyer yokuşunda düştüm')).id;
  b := (public.raise_sos('00000000-0000-0000-0000-00000000000b', 'kaza', 41.0105, 29.0205, 5, null)).id;
  if a <> b then raise exception '2 dk içinde ikinci alarm yeni kayıt açmamalı'; end if;
  if (select lat from public.courier_incidents where id = a) <> 41.0105 then raise exception 'konum güncellenmeli'; end if;
  if (select note from public.courier_incidents where id = a) <> 'Sarıyer yokuşunda düştüm' then raise exception 'not korunmalı'; end if;
  if not (select on_break from public.couriers where id = '00000000-0000-0000-0000-00000000000b') then
    raise exception 'alarm veren kuryeye iş gitmemeli (mola)'; end if;
end $$;

-- Kurye kendi alarmını görür, başka kurye görmez
select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$ begin
  if (select count(*) from public.courier_incidents) <> 1 then raise exception 'kurye kendi alarmını görmeli'; end if;
end $$;
select set_config('request.jwt.claim.sub', :kurye2, false);
do $$ begin
  if (select count(*) from public.courier_incidents) <> 0 then raise exception 'başka kuryenin alarmı görünmemeli'; end if;
  perform public.acknowledge_incident((select id from public.courier_incidents limit 1));
exception when insufficient_privilege then null;
end $$;

-- Yönetici: gördüm → kapat (not zorunlu)
select set_config('request.jwt.claim.sub', :admin, false);
do $$
declare v_id uuid := (select i.id from public.courier_incidents i where i.resolved_at is null limit 1);
begin
  perform public.acknowledge_incident(v_id);
  if (select acknowledged_by from public.courier_incidents where courier_incidents.id = v_id) <> '00000000-0000-0000-0000-00000000000a' then
    raise exception 'gören yönetici kaydedilmeli'; end if;
  begin
    perform public.resolve_incident(v_id, '  ');
    raise exception 'notsuz kapatıldı';
  exception when sqlstate '22023' then null;
  end;
  perform public.resolve_incident(v_id, 'Kurye arandı, hafif sıyrık; iş Emre''ye verildi');
  if (select resolved_at from public.courier_incidents where courier_incidents.id = v_id) is null then raise exception 'kapatılmalı'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
select (public.end_shift()).ended_at is not null as vardiya_bitti;
reset role;
\echo '  9H_sos.test.sql: tüm kontroller geçti'
