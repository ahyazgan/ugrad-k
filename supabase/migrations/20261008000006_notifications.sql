-- Bildirim kuyruğu (outbox). Sipariş oluştuğunda/durumu değiştiğinde bir satır eklenir;
-- notify-dispatch Edge Function'ı bekleyen satırları alıp SMS / WhatsApp / push gönderir.
-- Gönderim başarısız olursa satır kuyrukta kalır ve tekrar denenir (en fazla 5 kez).

create type public.notification_status as enum ('pending', 'processing', 'sent', 'failed', 'skipped');

create table public.notifications (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  event public.order_status not null,
  status public.notification_status not null default 'pending',
  attempts smallint not null default 0,
  last_error text,
  results jsonb,
  created_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  unique (order_id, event)
);
create index notifications_pending_idx on public.notifications (created_at) where status in ('pending', 'processing');

alter table public.notifications enable row level security;
create policy notifications_admin_read on public.notifications for select using (public.is_admin());

create or replace function public.enqueue_order_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    -- Aynı olay tekrar yaşanırsa (ör. sorunlu → yolda) yeniden gönderilir
    insert into public.notifications (order_id, event)
    values (new.id, new.status)
    on conflict (order_id, event) do update
      set status = 'pending', attempts = 0, last_error = null, locked_at = null, created_at = now();
  end if;
  return new;
end $$;

create trigger orders_enqueue_notification after insert or update of status on public.orders
  for each row execute function public.enqueue_order_notification();

-- Gönderici için: bekleyen satırları kilitleyerek al (eşzamanlı çalışmada çift gönderim olmaz).
-- 10 dakikadan uzun "processing"te kalanlar (çöken çalışma) tekrar alınır.
create or replace function public.claim_notifications(p_limit integer default 20)
returns setof public.notifications
language sql security definer set search_path = public as $$
  update public.notifications n
     set status = 'processing', locked_at = now(), attempts = n.attempts + 1
   where n.id in (
     select id from public.notifications
      where attempts < 5
        and (status = 'pending' or (status = 'processing' and locked_at < now() - interval '10 minutes'))
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning n.*;
$$;

revoke execute on function public.claim_notifications from public, anon, authenticated;
grant execute on function public.claim_notifications to service_role;
