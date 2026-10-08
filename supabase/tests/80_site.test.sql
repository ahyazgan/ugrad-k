-- Hız sınırı sayacı ve web başvuruları
reset role;
do $$
declare i int; ok boolean;
begin
  for i in 1..3 loop
    ok := public.hit_rate_limit('test:ip', 3, 60);
    if not ok then raise exception '% . istek izinli olmalı', i; end if;
  end loop;
  if public.hit_rate_limit('test:ip', 3, 60) then raise exception '4. istek reddedilmeli'; end if;
  if not public.hit_rate_limit('test:baska', 3, 60) then raise exception 'farklı anahtar etkilenmemeli'; end if;
  -- Pencere dolunca sıfırlanır
  update public.rate_limits set window_start = now() - interval '2 minutes' where key = 'test:ip';
  if not public.hit_rate_limit('test:ip', 3, 60) then raise exception 'yeni pencerede izin verilmeli'; end if;
  if (select hits from public.rate_limits where key = 'test:ip') <> 1 then raise exception 'sayaç sıfırlanmalı'; end if;
end $$;

insert into public.leads (kind, company_name, contact_name, phone, kvkk_consent_at)
values ('kurumsal', 'Örnek AŞ', 'Ali', '+902165554433', now());

-- Müşteri başvuruları göremez, sayaç fonksiyonunu çağıramaz
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.leads) <> 0 then raise exception 'müşteri başvuruları görmemeli'; end if;
  begin
    perform public.hit_rate_limit('x', 1, 1);
    raise exception 'authenticated sayaç çağıramamalı';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;
do $$
begin
  if (select count(*) from public.leads) <> 1 then raise exception 'yönetici başvuruları görmeli'; end if;
  update public.leads set status = 'arandi';
  if (select status from public.leads limit 1) <> 'arandi' then raise exception 'yönetici durumu güncelleyebilmeli'; end if;
end $$;
reset role;
\echo '  80_site.test.sql: tüm kontroller geçti'
