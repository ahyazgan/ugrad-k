-- Vardiya planlama: dilimler, alma/doluluk/iptal, hatırlatma ve gelmedi
\set admin  '''00000000-0000-0000-0000-00000000000a'''
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set kurye2 '''00000000-0000-0000-0000-00000000000d'''
\set cust1  '''00000000-0000-0000-0000-0000000000c1'''

reset role;
update public.couriers set active = true where id in (:kurye, :kurye2);
do $$ begin
  if public.istanbul_ts('2026-10-12', '08:00') <> '2026-10-12 05:00:00+00' then raise exception 'İstanbul saati yanlış'; end if;
  if (select count(*) from public.shift_templates where weekday = 1) <> 4 or (select count(*) from public.shift_templates where weekday = 7) <> 3 then
    raise exception 'varsayılan dilimler eksik'; end if;
end $$;

-- Yarının sabah dilimi tek kişilik olsun
create temp table t_slot as
  select t.id as template_id, (now() at time zone 'Europe/Istanbul')::date + 1 as day
    from public.shift_templates t
   where t.weekday = extract(isodow from (now() at time zone 'Europe/Istanbul')::date + 1) and t.start_time = (select min(start_time) from public.shift_templates x where x.weekday = t.weekday);
grant select on t_slot to authenticated;
update public.shift_templates set required = 1 where id = (select template_id from t_slot);

select set_config('request.jwt.claim.sub', :kurye, false);
set role authenticated;
do $$
declare b1 uuid; b2 uuid; tid integer := (select template_id from t_slot); d date := (select day from t_slot);
begin
  b1 := (public.book_shift(tid, d)).id;
  b2 := (public.book_shift(tid, d)).id;
  if b1 <> b2 then raise exception 'aynı dilim iki kez alınmamalı'; end if;
  if not (select mine from public.shift_slots(d, 1) s where s.template_id = tid) then raise exception 'aldığım dilim işaretli olmalı'; end if;
  -- Yanlış gün / geçmiş
  begin
    perform public.book_shift(tid, d + 1);
    raise exception 'yanlış güne dilim alındı';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.book_shift(tid, d - 7);
    raise exception 'geçmişe dilim alındı';
  exception when sqlstate '22023' then null;
  end;
end $$;
-- Dolu dilimi başka kurye alamaz; yönetici fazladan atayabilir
select set_config('request.jwt.claim.sub', :kurye2, false);
do $$ begin
  perform public.book_shift((select template_id from t_slot), (select day from t_slot));
  raise exception 'dolu dilim alındı';
exception when sqlstate '22023' then
  if sqlerrm <> 'Bu vardiya dolu' then raise; end if;
end $$;
do $$ begin
  if (select count(*) from public.shift_bookings) <> 0 then raise exception 'başka kuryenin vardiyası görünmemeli'; end if;
end $$;
select set_config('request.jwt.claim.sub', :admin, false);
select (public.book_shift((select template_id from t_slot), (select day from t_slot), :kurye2)).courier_id = :kurye2 as yonetici_atadi;
do $$ begin
  if (select booked from public.shift_slots((select day from t_slot), 1) s where s.template_id = (select template_id from t_slot)) <> 2 then
    raise exception 'alınan sayı 2 olmalı'; end if;
end $$;
-- Müşteri vardiya alamaz
select set_config('request.jwt.claim.sub', :cust1, false);
do $$ begin
  perform public.book_shift((select template_id from t_slot), (select day from t_slot));
  raise exception 'müşteri vardiya aldı';
exception when insufficient_privilege then null;
end $$;
reset role;

-- İptal: erken iptal geç sayılmaz; 2 saatten az kala geç iptal
update public.shift_bookings set starts_at = now() + interval '90 minutes', ends_at = now() + interval '5 hours'
 where courier_id = :kurye2 and cancelled_at is null;
select set_config('request.jwt.claim.sub', :kurye2, false);
set role authenticated;
select (public.cancel_shift_booking((select id from public.shift_bookings where cancelled_at is null limit 1))).late_cancel as gec_iptal;
reset role;
do $$ begin
  if not (select late_cancel from public.shift_bookings where courier_id = '00000000-0000-0000-0000-00000000000d') then
    raise exception '2 saatten az kala iptal geç sayılmalı'; end if;
end $$;

-- Hatırlatma ve gelmedi
update public.shift_bookings set starts_at = now() + interval '60 minutes', ends_at = now() + interval '5 hours'
 where courier_id = :kurye and cancelled_at is null;
do $$ begin
  if (select count(*) from public.shift_reminders_due() r where r.courier_id = '00000000-0000-0000-0000-00000000000b') <> 1 then
    raise exception 'hatırlatma zamanı gelmeli'; end if;
end $$;
update public.courier_shifts set ended_at = now() - interval '1 hour' where courier_id = :kurye and ended_at is null;
-- Önceki testlerin az önce biten vardiyaları dilimle örtüşmesin
update public.courier_shifts set started_at = started_at - interval '1 day', ended_at = ended_at - interval '1 day'
 where courier_id = :kurye and ended_at > now() - interval '3 hours';
update public.shift_bookings set starts_at = now() - interval '20 minutes' where courier_id = :kurye and cancelled_at is null;
do $$ begin
  if (select count(*) from public.shift_no_shows_due() r where r.courier_id = '00000000-0000-0000-0000-00000000000b') <> 1 then
    raise exception 'vardiyayı açmayan kurye gelmedi sayılmalı'; end if;
end $$;
insert into public.courier_shifts (courier_id, started_at) values (:kurye, now() - interval '10 minutes');
do $$ begin
  if exists (select 1 from public.shift_no_shows_due() r where r.courier_id = '00000000-0000-0000-0000-00000000000b') then
    raise exception 'geç de olsa gelen kurye gelmedi sayılmamalı'; end if;
end $$;
update public.courier_shifts set ended_at = now() where courier_id = :kurye and ended_at is null;
update public.couriers set is_on_shift = false, on_break = false where id = :kurye;
\echo '  9L_shift_planning.test.sql: tüm kontroller geçti'
