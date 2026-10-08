-- Kurumsal API: API anahtarları, dış referans/tekrar önleme ve sipariş durum webhook'ları.

-- ───────── API anahtarları (yalnız SHA-256 özeti saklanır; anahtar oluşturulduğunda bir kez gösterilir)
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  corporate_account_id uuid not null references public.corporate_accounts (id) on delete cascade,
  -- Siparişler bu kurumsal kullanıcı adına açılır (KVKK onayı ve cari hesap ondan gelir)
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_account_idx on public.api_keys (corporate_account_id);
alter table public.api_keys enable row level security;
create policy api_keys_admin_all on public.api_keys for all using (public.is_admin()) with check (public.is_admin());

-- Anahtarın kullanıcısı aynı kurumsal hesaba bağlı olmalı
create or replace function public.check_api_key_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = new.profile_id and corporate_account_id = new.corporate_account_id) then
    raise exception 'Anahtar kullanıcısı bu kurumsal hesaba bağlı değil' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger api_keys_profile_check before insert or update of profile_id, corporate_account_id on public.api_keys
  for each row execute function public.check_api_key_profile();

-- ───────── Siparişte API bilgisi
alter table public.orders
  add column api_key_id uuid references public.api_keys (id) on delete set null,
  add column external_ref text check (external_ref is null or length(external_ref) <= 100);
-- Aynı dış referansla ikinci sipariş açılmaz (ağ hatasında tekrar deneme güvenli)
create unique index orders_corporate_external_ref on public.orders (corporate_account_id, external_ref) where external_ref is not null;

-- ───────── Webhook ayarı (gizli anahtar üyelerin okuyabildiği corporate_accounts'ta değil, ayrı tabloda)
create table public.corporate_webhooks (
  corporate_account_id uuid primary key references public.corporate_accounts (id) on delete cascade,
  url text not null check (url ~ '^https://'),
  secret text not null check (length(secret) >= 24),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.corporate_webhooks enable row level security;
create policy corporate_webhooks_admin_all on public.corporate_webhooks for all using (public.is_admin()) with check (public.is_admin());
create trigger corporate_webhooks_touch before update on public.corporate_webhooks
  for each row execute function public.set_updated_at();

-- ───────── Webhook giden kutusu
create table public.webhook_deliveries (
  id bigint generated always as identity primary key,
  corporate_account_id uuid not null references public.corporate_accounts (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'failed')),
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  response_status smallint,
  locked_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at) where status in ('pending', 'processing');
alter table public.webhook_deliveries enable row level security;
create policy webhook_deliveries_admin_read on public.webhook_deliveries for select using (public.is_admin());

-- Sipariş oluştuğunda / durumu değiştiğinde kurumsal hesabın webhook'u varsa olay kuyruğa girer
create or replace function public.enqueue_order_webhook()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.corporate_account_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  if not exists (select 1 from public.corporate_webhooks w where w.corporate_account_id = new.corporate_account_id and w.active) then
    return new;
  end if;
  insert into public.webhook_deliveries (corporate_account_id, order_id, event, payload)
  values (
    new.corporate_account_id,
    new.id,
    case when tg_op = 'INSERT' then 'order.created' else 'order.status_changed' end,
    jsonb_build_object(
      'event', case when tg_op = 'INSERT' then 'order.created' else 'order.status_changed' end,
      'occurred_at', now(),
      'order', jsonb_build_object(
        'id', new.id,
        'order_no', new.order_no,
        'external_ref', new.external_ref,
        'status', new.status,
        'previous_status', case when tg_op = 'UPDATE' then old.status end,
        'total_kurus', new.total_kurus,
        'tracking_token', new.tracking_token,
        'pod_receiver_name', new.pod_receiver_name,
        'delivered_at', new.delivered_at,
        'cancel_reason', new.cancel_reason
      )
    )
  );
  return new;
end $$;
create trigger orders_enqueue_webhook after insert or update of status on public.orders
  for each row execute function public.enqueue_order_webhook();

-- Gönderici: zamanı gelmiş teslimatları kilitleyerek al (10 dk'dan uzun kilitli kalanlar yeniden alınır)
create or replace function public.claim_webhook_deliveries(p_limit integer default 20)
returns setof public.webhook_deliveries
language sql security definer set search_path = public as $$
  update public.webhook_deliveries d
     set status = 'processing', locked_at = now(), attempts = d.attempts + 1
   where d.id in (
     select id from public.webhook_deliveries
      where (status = 'pending' and next_attempt_at <= now())
         or (status = 'processing' and locked_at < now() - interval '10 minutes')
      order by next_attempt_at
      limit p_limit
      for update skip locked
   )
  returning d.*;
$$;
revoke execute on function public.claim_webhook_deliveries from public, anon, authenticated;
grant execute on function public.claim_webhook_deliveries to service_role;

-- API'den iptal: yalnız hesabın kendi siparişi ve kurye yola çıkmadan
create or replace function public.api_cancel_order(p_order_id uuid, p_corporate_account_id uuid, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order_id and corporate_account_id = p_corporate_account_id for update;
  if not found then return 'not_found'; end if;
  if o.status not in ('beklemede', 'onaylandi') then return 'not_cancellable'; end if;
  perform set_config('app.status_note', coalesce(nullif(trim(p_reason), ''), 'API ile iptal'), true);
  update public.orders set status = 'iptal', cancel_reason = coalesce(nullif(trim(p_reason), ''), 'API ile iptal') where id = p_order_id;
  return 'ok';
end $$;
revoke execute on function public.api_cancel_order from public, anon, authenticated;
grant execute on function public.api_cancel_order to service_role;
