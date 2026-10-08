-- Sistem izleme
reset role;
do $$
declare h jsonb;
begin
  perform public.record_heartbeat('notify-dispatch');
  perform public.record_heartbeat('notify-dispatch');
  if (select count(*) from public.system_heartbeats) <> 1 then raise exception 'nabız tek satır olmalı'; end if;
  h := public.system_health();
  if not (h ? 'notifications_stuck' and h ? 'orders_waiting' and h ? 'couriers_stale') then raise exception 'sağlık özeti eksik: %', h; end if;
  if h -> 'heartbeats' ->> 'notify-dispatch' is null then raise exception 'nabız özette görünmeli'; end if;
  if (h ->> 'orders_problem')::int < 0 then raise exception 'sayı olmalı'; end if;
end $$;
set role authenticated;
do $$ begin
  begin
    perform public.system_health();
    raise exception 'authenticated system_health çağıramamalı';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo '  97_monitoring.test.sql: tüm kontroller geçti'
