-- Kurye performans sayıları: teklif, teslim, puan, bırakma, vardiya katılımı; erişim
\set admin  '''00000000-0000-0000-0000-00000000000a'''
\set kurye  '''00000000-0000-0000-0000-00000000000b'''
\set kurye2 '''00000000-0000-0000-0000-00000000000d'''

reset role;
-- Önceki testlerin izlerinden bağımsız: kurye2'nin son 30 günü sıfırdan
delete from public.courier_offers where courier_id = :kurye2;
delete from public.shift_bookings where courier_id = :kurye2;
insert into public.courier_offers (order_id, courier_id, offered_at, expires_at, responded_at, response)
select o.id, :kurye2, now() - interval '1 day', now(), now() - interval '1 day', r
  from (select id from public.orders limit 1) o, unnest(array['kabul', 'kabul', 'kabul', 'ret', 'zaman_asimi']) r;
insert into public.shift_bookings (courier_id, starts_at, ends_at)
values (:kurye2, now() - interval '2 days 4 hours', now() - interval '2 days'),
       (:kurye2, now() - interval '3 days 4 hours', now() - interval '3 days');
insert into public.courier_shifts (courier_id, started_at, ended_at)
values (:kurye2, now() - interval '2 days 4 hours', now() - interval '2 days 1 hour');
insert into public.shift_bookings (courier_id, starts_at, ends_at, cancelled_at, late_cancel)
values (:kurye2, now() + interval '1 hour', now() + interval '5 hours', now() - interval '1 hour', true);

select set_config('request.jwt.claim.sub', :admin, false);
set role authenticated;
do $$
declare r record;
begin
  select * into r from public.courier_performance_stats(30, '00000000-0000-0000-0000-00000000000d');
  if r.offers_accepted <> 3 or r.offers_declined <> 1 or r.offers_timed_out <> 1 then raise exception 'teklif sayıları yanlış: %', r; end if;
  if r.shifts_booked <> 2 or r.shifts_attended <> 1 or r.late_cancels <> 1 then raise exception 'vardiya sayıları yanlış: %', r; end if;
  if (select count(*) from public.courier_performance_stats()) < 2 then raise exception 'yönetici tüm kuryeleri görmeli'; end if;
end $$;
-- Kurye yalnız kendini görür
select set_config('request.jwt.claim.sub', :kurye, false);
do $$ begin
  if (select count(*) from public.courier_performance_stats()) <> 1 then raise exception 'kurye yalnız kendini görmeli'; end if;
  if exists (select 1 from public.courier_performance_stats(30, '00000000-0000-0000-0000-00000000000d')) then
    raise exception 'kurye başkasını gördü'; end if;
end $$;
reset role;
\echo '  9M_courier_performance.test.sql: tüm kontroller geçti'
