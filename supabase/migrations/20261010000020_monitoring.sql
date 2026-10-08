-- Sistem izleme: zamanlanmış görevlerin nabzı, sağlık özeti ve uyarı durumu.

-- Her zamanlanmış görev çalıştığında nabız yazar; "health" görevi gecikeni yakalar.
create table public.system_heartbeats (
  name text primary key,
  last_run_at timestamptz not null default now()
);
alter table public.system_heartbeats enable row level security;
create policy system_heartbeats_admin_read on public.system_heartbeats for select using (public.is_admin());

create or replace function public.record_heartbeat(p_name text)
returns void language sql security definer set search_path = public as $$
  insert into public.system_heartbeats (name, last_run_at) values (p_name, now())
  on conflict (name) do update set last_run_at = excluded.last_run_at;
$$;
revoke execute on function public.record_heartbeat from public, anon, authenticated;
grant execute on function public.record_heartbeat to service_role;

-- Açık uyarılar: aynı sorun için tekrar tekrar mesaj atılmasın, düzelince haber verilsin
create table public.system_alerts (
  key text primary key,
  message text not null,
  first_seen_at timestamptz not null default now(),
  last_alerted_at timestamptz,
  resolved_at timestamptz
);
alter table public.system_alerts enable row level security;
create policy system_alerts_admin_read on public.system_alerts for select using (public.is_admin());

-- Tek sorguda sağlık özeti (eşikler burada; yorumlama Edge Function'da)
create or replace function public.system_health()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'checked_at', now(),
    'notifications_stuck', (select count(*) from public.notifications
       where status in ('pending', 'processing') and attempts < 5 and created_at < now() - interval '10 minutes'),
    'notifications_failed_24h', (select count(*) from public.notifications
       where status = 'failed' and created_at > now() - interval '24 hours'),
    'invoices_failed', (select count(*) from public.invoices where status = 'failed'),
    'invoices_stuck', (select count(*) from public.invoices
       where status in ('pending', 'processing') and created_at < now() - interval '1 hour'),
    'webhooks_failed_24h', (select count(*) from public.webhook_deliveries
       where status = 'failed' and created_at > now() - interval '24 hours'),
    'webhooks_stuck', (select count(*) from public.webhook_deliveries
       where status = 'pending' and next_attempt_at < now() - interval '30 minutes'),
    'orders_waiting', (select count(*) from public.orders
       where status in ('beklemede', 'onaylandi') and created_at < now() - interval '30 minutes'
         and coalesce(scheduled_pickup_at, created_at) < now()
         and not (payment_method = 'kart' and payment_status = 'odenmedi')),
    'orders_problem', (select count(*) from public.orders where status = 'sorunlu'),
    'couriers_on_shift', (select count(*) from public.couriers where is_on_shift and active),
    'couriers_stale', (select count(*) from public.couriers
       where is_on_shift and active and (last_location_at is null or last_location_at < now() - interval '15 minutes')),
    'heartbeats', coalesce((select jsonb_object_agg(name, last_run_at) from public.system_heartbeats), '{}'::jsonb)
  );
$$;
revoke execute on function public.system_health from public, anon, authenticated;
grant execute on function public.system_health to service_role;
