-- Teslim sonrası değerlendirme (1–5 puan + yorum). Takip bağlantısından (girişsiz) veya uygulamadan verilir;
-- site-api "rate" işlemi kaydeder, düşük puanda yöneticiye uyarı gönderir, 5 puanda Google yorum bağlantısı döner.

create table public.order_ratings (
  order_id uuid primary key references public.orders (id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  comment text check (comment is null or length(comment) <= 1000),
  source text not null default 'takip' check (source in ('takip', 'uygulama')),
  created_at timestamptz not null default now()
);
create index order_ratings_created_idx on public.order_ratings (created_at desc);

alter table public.order_ratings enable row level security;
create policy order_ratings_admin_read on public.order_ratings for select using (public.is_admin());
create policy order_ratings_customer_read on public.order_ratings for select using (
  exists (select 1 from public.orders o where o.id = order_ratings.order_id and o.customer_id = auth.uid())
);

-- Takip anahtarıyla değerlendirme: yalnız teslim edilmiş, son 14 gün içinde ve bir kez.
-- Dönüş: 'ok' | 'not_found' | 'not_delivered' | 'expired' | 'exists'
create or replace function public.submit_rating(p_token text, p_score integer, p_comment text default null, p_source text default 'takip')
returns text language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if p_score is null or p_score < 1 or p_score > 5 then raise exception 'Puan 1-5 arası olmalı' using errcode = '22023'; end if;
  select * into o from public.orders where tracking_token = p_token and length(p_token) >= 32;
  if not found then return 'not_found'; end if;
  if o.status <> 'teslim_edildi' then return 'not_delivered'; end if;
  if o.delivered_at < now() - interval '14 days' then return 'expired'; end if;
  insert into public.order_ratings (order_id, score, comment, source)
  values (o.id, p_score, nullif(trim(left(coalesce(p_comment, ''), 1000)), ''), case when p_source = 'uygulama' then 'uygulama' else 'takip' end)
  on conflict (order_id) do nothing;
  if not found then return 'exists'; end if;
  return 'ok';
end $$;
revoke execute on function public.submit_rating from public, anon, authenticated;
grant execute on function public.submit_rating to service_role;

-- Takip sayfası değerlendirme durumunu da gösterir (mevcut alanlar korunur)
create or replace function public.get_tracking(p_token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_no', o.order_no,
    'status', o.status,
    'urgent', o.urgent,
    'pickup_address', o.pickup_address,
    'dropoff_address', o.dropoff_address,
    'dropoff_lat', o.dropoff_lat,
    'dropoff_lng', o.dropoff_lng,
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
