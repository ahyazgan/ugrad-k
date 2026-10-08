-- Satır düzeyi güvenlik (RLS) ve uygulamaların çağırdığı fonksiyonlar.
-- İlke: istemciler siparişi doğrudan INSERT/UPDATE edemez.
--   • Sipariş oluşturma ve fiyat: Edge Function (service role, pricing.ts)
--   • Durum değişikliği: set_order_status() — rol bazlı kontrol burada
--   • Kurye atama: assign_courier() — yalnızca yönetici

alter table public.corporate_accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.couriers enable row level security;
alter table public.courier_shifts enable row level security;
alter table public.pricing_settings enable row level security;
alter table public.pricing_settings_history enable row level security;
alter table public.holidays enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_status_transitions enable row level security;
alter table public.order_status_history enable row level security;
alter table public.courier_locations enable row level security;
alter table public.consents enable row level security;

-- Kuryenin müşteriye görünür olduğu aktif durumlar
create or replace function public.is_active_delivery_status(s public.order_status)
returns boolean language sql immutable as $$
  select s in ('kuryeye_atandi', 'alindi', 'yolda');
$$;

-- ───────── corporate_accounts
create policy corporate_admin_all on public.corporate_accounts
  for all using (public.is_admin()) with check (public.is_admin());
create policy corporate_member_read on public.corporate_accounts
  for select using (
    id = (select corporate_account_id from public.profiles where id = auth.uid())
  );

-- ───────── profiles
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_assigned_courier_read on public.profiles
  for select using (
    exists (
      select 1 from public.orders o
      where o.courier_id = profiles.id
        and o.customer_id = auth.uid()
        and public.is_active_delivery_status(o.status)
    )
  );
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy profiles_admin_insert on public.profiles
  for insert with check (public.is_admin());

-- ───────── couriers
create policy couriers_self_read on public.couriers
  for select using (id = auth.uid() or public.is_admin());
create policy couriers_admin_write on public.couriers
  for all using (public.is_admin()) with check (public.is_admin());

-- ───────── courier_shifts (yazma start_shift/end_shift ile)
create policy shifts_read on public.courier_shifts
  for select using (courier_id = auth.uid() or public.is_admin());
create policy shifts_admin_write on public.courier_shifts
  for all using (public.is_admin()) with check (public.is_admin());

-- ───────── pricing_settings / holidays: herkes okur (fiyat gösterimi), yönetici yazar
create policy pricing_read on public.pricing_settings for select using (true);
create policy pricing_admin_write on public.pricing_settings
  for all using (public.is_admin()) with check (public.is_admin());
create policy pricing_history_admin on public.pricing_settings_history
  for select using (public.is_admin());

create policy holidays_read on public.holidays for select using (true);
create policy holidays_admin_write on public.holidays
  for all using (public.is_admin()) with check (public.is_admin());

-- ───────── addresses
create policy addresses_owner on public.addresses
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy addresses_admin_read on public.addresses
  for select using (public.is_admin());

-- ───────── orders
create policy orders_customer_read on public.orders
  for select using (customer_id = auth.uid());
create policy orders_courier_read on public.orders
  for select using (courier_id = auth.uid());
create policy orders_admin_all on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

create policy transitions_read on public.order_status_transitions for select using (true);

create policy history_read on public.order_status_history
  for select using (
    public.is_admin() or exists (
      select 1 from public.orders o
      where o.id = order_status_history.order_id
        and (o.customer_id = auth.uid() or o.courier_id = auth.uid())
    )
  );

-- ───────── courier_locations
create policy locations_courier_insert on public.courier_locations
  for insert with check (
    courier_id = auth.uid()
    and exists (select 1 from public.couriers c where c.id = auth.uid() and c.active)
    and (
      order_id is null or exists (
        select 1 from public.orders o where o.id = order_id and o.courier_id = auth.uid()
      )
    )
  );
create policy locations_read on public.courier_locations
  for select using (
    courier_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = courier_locations.order_id
        and o.customer_id = auth.uid()
        and public.is_active_delivery_status(o.status)
    )
  );

-- ───────── consents (değiştirilemez kayıt)
create policy consents_self_insert on public.consents
  for insert with check (profile_id = auth.uid());
create policy consents_read on public.consents
  for select using (profile_id = auth.uid() or public.is_admin());

-- ═════════════════════════ Fonksiyonlar ═════════════════════════

-- Rol bazlı durum değişikliği.
--   musteri: kendi siparişini beklemede/onaylandi iken iptal edebilir
--   kurye  : kendisine atanmış siparişi alindi → yolda → teslim_edildi, sorunlu
--            veya işi geri bırakma (kuryeye_atandi → onaylandi)
--   admin  : izinli tüm geçişler
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_note text default null,
  p_waiting_minutes integer default null,
  p_pod_photo_path text default null,
  p_pod_signature_path text default null,
  p_pod_receiver_name text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  uid uuid := auth.uid();
  is_adm boolean := public.is_admin();
begin
  if uid is null then
    raise exception 'Giriş gerekli' using errcode = '42501';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Sipariş bulunamadı' using errcode = 'P0002';
  end if;

  if not is_adm then
    if o.customer_id = uid then
      if not (p_status = 'iptal' and o.status in ('beklemede', 'onaylandi')) then
        raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
      end if;
    elsif o.courier_id = uid and public.current_role_is('kurye') then
      if not (
        p_status in ('alindi', 'yolda', 'teslim_edildi', 'sorunlu')
        or (p_status = 'onaylandi' and o.status = 'kuryeye_atandi')
      ) then
        raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
      end if;
    else
      raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
    end if;
  end if;

  -- Kurye teslimde kanıt yüklemek zorunda; yönetici (ör. kuryenin telefonu kapandıysa) kanıtsız kapatabilir
  if p_status = 'teslim_edildi' and not is_adm
     and coalesce(p_pod_photo_path, o.pod_photo_path, p_pod_signature_path, o.pod_signature_path) is null then
    raise exception 'Teslim için fotoğraf veya imza gerekli' using errcode = '22023';
  end if;
  if p_status in ('iptal', 'sorunlu') and nullif(trim(coalesce(p_note, '')), '') is null and not is_adm then
    raise exception 'Lütfen bir açıklama girin' using errcode = '22023';
  end if;
  if p_waiting_minutes is not null and p_waiting_minutes < 0 then
    raise exception 'Bekleme süresi geçersiz' using errcode = '22023';
  end if;

  perform set_config('app.status_note', coalesce(p_note, ''), true);

  update public.orders set
    status = p_status,
    waiting_minutes = coalesce(p_waiting_minutes, waiting_minutes),
    pod_photo_path = coalesce(p_pod_photo_path, pod_photo_path),
    pod_signature_path = coalesce(p_pod_signature_path, pod_signature_path),
    pod_receiver_name = coalesce(p_pod_receiver_name, pod_receiver_name),
    cancel_reason = case when p_status = 'iptal' then p_note else cancel_reason end,
    problem_note = case when p_status = 'sorunlu' then p_note else problem_note end
  where id = p_order_id
  returning * into o;

  return o;
end $$;

-- Yönetici kurye atar. Beklemedeki sipariş önce onaylanır.
create or replace function public.assign_courier(p_order_id uuid, p_courier_id uuid)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  if not public.is_admin() then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  if not exists (select 1 from public.couriers where id = p_courier_id and active) then
    raise exception 'Kurye bulunamadı veya pasif' using errcode = '22023';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Sipariş bulunamadı' using errcode = 'P0002';
  end if;

  if o.status = 'beklemede' then
    update public.orders set status = 'onaylandi' where id = p_order_id;
  elsif o.status = 'kuryeye_atandi' then
    -- başka kuryeye aktarma
    update public.orders set status = 'onaylandi' where id = p_order_id;
  end if;

  update public.orders set courier_id = p_courier_id, status = 'kuryeye_atandi'
  where id = p_order_id
  returning * into o;
  return o;
end $$;

-- Kurye vardiyası (BTK raporu için çalışma saatleri)
create or replace function public.start_shift(p_lat double precision default null, p_lng double precision default null)
returns public.courier_shifts
language plpgsql security definer set search_path = public as $$
declare
  s public.courier_shifts;
begin
  if not exists (select 1 from public.couriers where id = auth.uid() and active) then
    raise exception 'Aktif kurye kaydı bulunamadı' using errcode = '42501';
  end if;
  select * into s from public.courier_shifts where courier_id = auth.uid() and ended_at is null;
  if found then
    return s;
  end if;
  insert into public.courier_shifts (courier_id, start_lat, start_lng)
  values (auth.uid(), p_lat, p_lng) returning * into s;
  update public.couriers set is_on_shift = true where id = auth.uid();
  return s;
end $$;

create or replace function public.end_shift(p_lat double precision default null, p_lng double precision default null)
returns public.courier_shifts
language plpgsql security definer set search_path = public as $$
declare
  s public.courier_shifts;
begin
  update public.courier_shifts
     set ended_at = now(), end_lat = p_lat, end_lng = p_lng
   where courier_id = auth.uid() and ended_at is null
  returning * into s;
  update public.couriers set is_on_shift = false where id = auth.uid();
  if s.id is null then
    raise exception 'Açık vardiya yok' using errcode = '22023';
  end if;
  return s;
end $$;

-- Herkese açık takip linki: /takip/<token>. Kişisel veri en aza indirilir (KVKK).
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
    )
  )
  from public.orders o
  left join public.profiles p on p.id = o.courier_id
  where o.tracking_token = p_token and length(p_token) >= 32;
$$;

-- Yetkiler: fonksiyonlar varsayılan olarak herkese açıktır; daraltıyoruz.
revoke execute on function public.set_order_status from public, anon;
revoke execute on function public.assign_courier from public, anon;
revoke execute on function public.start_shift from public, anon;
revoke execute on function public.end_shift from public, anon;
grant execute on function public.set_order_status to authenticated;
grant execute on function public.assign_courier to authenticated;
grant execute on function public.start_shift to authenticated;
grant execute on function public.end_shift to authenticated;
grant execute on function public.get_tracking to anon, authenticated;
