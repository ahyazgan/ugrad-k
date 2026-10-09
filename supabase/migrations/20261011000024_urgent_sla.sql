-- Acil teslim taahhüdü (varsayılan 60 dk) ve gecikme telafisi.
--  • orders.sla_due_at: acil siparişte taahhüt edilen en geç teslim (sipariş / planlı alış / kart ödemesi + süre)
--  • orders.sla_missed: teslim taahhütten sonra olduysa
--  • customer_credits: kaçırılan taahhütte acil ek ücreti kadar kredi; müşterinin sonraki siparişinden düşülür
--  • orders.sla_alerted_at: gecikme riski uyarısı (yönetici + müşteri) bir kez gönderilir (auto-dispatch)

alter table public.ops_settings
  add column urgent_sla_minutes integer not null default 60 check (urgent_sla_minutes between 15 and 480);

alter table public.orders
  add column sla_due_at timestamptz,
  add column sla_missed boolean,
  add column sla_alerted_at timestamptz;
create index orders_sla_open_idx on public.orders (sla_due_at)
  where sla_due_at is not null and status in ('beklemede', 'onaylandi', 'kuryeye_atandi', 'alindi', 'yolda');

-- Durum tetikleyicisinden (delivered_at) sonra çalışsın diye adı "zz"
create or replace function public.orders_sla()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  start_at timestamptz;
begin
  if new.delivered_at is null then
    if new.service_level = 'acil' then
      start_at := greatest(new.created_at, coalesce(new.scheduled_pickup_at, new.created_at));
      -- Kartla ödemede saat ödeme alınınca başlar
      if new.payment_method = 'kart' and new.paid_at is not null then
        start_at := greatest(start_at, new.paid_at);
      end if;
      new.sla_due_at := start_at + make_interval(mins => (select urgent_sla_minutes from public.ops_settings where id = 1));
    else
      new.sla_due_at := null;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.status = 'teslim_edildi' and old.status is distinct from 'teslim_edildi' then
    new.sla_missed := case when new.sla_due_at is null then null else new.delivered_at > new.sla_due_at end;
  end if;
  return new;
end $$;
create trigger orders_zz_sla before insert or update on public.orders
  for each row execute function public.orders_sla();

update public.orders set sla_due_at = created_at + interval '60 minutes'
  where service_level = 'acil' and delivered_at is null and status not in ('iptal');

create table public.customer_credits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  -- Krediyi doğuran sipariş (bir siparişten en fazla bir kredi)
  source_order_id uuid unique references public.orders (id) on delete set null,
  amount_kurus integer not null check (amount_kurus > 0),
  reason text not null,
  used_order_id uuid references public.orders (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index customer_credits_open_idx on public.customer_credits (customer_id) where used_order_id is null;
alter table public.customer_credits enable row level security;
create policy customer_credits_own_read on public.customer_credits for select using (customer_id = auth.uid() or public.is_admin());
create policy customer_credits_admin on public.customer_credits for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.grant_sla_credit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  amount integer;
begin
  if new.status = 'teslim_edildi' and old.status is distinct from 'teslim_edildi' and new.sla_missed then
    select coalesce(sum((l ->> 'amountKurus')::integer), 0) into amount
      from jsonb_array_elements(coalesce(new.price_quote -> 'lines', '[]'::jsonb)) l
     where l ->> 'code' = 'urgent';
    if amount > 0 then
      insert into public.customer_credits (customer_id, source_order_id, amount_kurus, reason)
      values (new.customer_id, new.id, amount, new.order_no || ' acil teslim gecikmesi telafisi')
      on conflict (source_order_id) do nothing;
    end if;
  end if;
  return new;
end $$;
create trigger orders_grant_sla_credit after update of status on public.orders
  for each row execute function public.grant_sla_credit();

-- Takip sayfası: taahhüt ve tahmini varış için alış konumu ve rota süresi eklendi
create or replace function public.get_tracking(p_token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_no', o.order_no,
    'status', o.status,
    'urgent', o.urgent,
    'pickup_address', o.pickup_address,
    'dropoff_address', o.dropoff_address,
    'pickup_lat', o.pickup_lat,
    'pickup_lng', o.pickup_lng,
    'dropoff_lat', o.dropoff_lat,
    'dropoff_lng', o.dropoff_lng,
    'duration_seconds', o.duration_seconds,
    'sla_due_at', o.sla_due_at,
    'sla_missed', o.sla_missed,
    'created_at', o.created_at,
    'picked_up_at', o.picked_up_at,
    'delivered_at', o.delivered_at,
    'courier_first_name', case when o.courier_id is not null
      then split_part(coalesce(p.full_name, ''), ' ', 1) end,
    'courier_location', case when public.is_active_delivery_status(o.status) then (
      select jsonb_build_object('lat', l.lat, 'lng', l.lng, 'recorded_at', l.recorded_at)
      from public.courier_locations l
      where l.courier_id = o.courier_id and l.recorded_at > now() - interval '30 minutes'
      order by l.recorded_at desc limit 1
    ) end,
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object('status', h.to_status, 'at', h.created_at) order by h.created_at), '[]'::jsonb)
      from public.order_status_history h where h.order_id = o.id
    ),
    'rating', (select r.score from public.order_ratings r where r.order_id = o.id),
    'can_rate', o.status = 'teslim_edildi' and o.delivered_at > now() - interval '14 days'
      and not exists (select 1 from public.order_ratings r where r.order_id = o.id)
  )
  from public.orders o
  left join public.profiles p on p.id = o.courier_id
  where o.tracking_token = p_token and length(p_token) >= 32;
$$;
