-- Adrese varış ve bekleme süresinin otomatik ölçümü.
--  • orders.arrived_pickup_at / arrived_dropoff_at: kurye alış/teslim adresine vardı
--    - Otomatik: kurye konumu (courier_locations) adrese ops.arrival_auto_radius_m (100 m) yaklaşınca
--    - Elle: kurye uygulamasında "Vardım" (mark_arrived); adrese ops.arrival_max_radius_m (300 m) içinde olmalı
--  • Bekleme: paket alınınca varıştan (planlı alışta en erken alış saatinden) itibaren ölçülür;
--    ölçüm varsa kuryenin girdiği değerin yerine geçer (waiting_source = 'olcum' / 'elle')
--  • notifications.kind: durum dışı olaylar (varis_alis, varis_teslim, ...) aynı kuyruktan gider

alter table public.ops_settings
  add column arrival_auto_radius_m integer not null default 100 check (arrival_auto_radius_m between 30 and 500),
  add column arrival_max_radius_m integer not null default 300 check (arrival_max_radius_m between 50 and 2000);

alter table public.orders
  add column arrived_pickup_at timestamptz,
  add column arrived_dropoff_at timestamptz,
  add column waiting_source text check (waiting_source in ('olcum', 'elle'));

-- Kuş uçuşu mesafe (metre)
create or replace function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- ───────── Bildirim türü: durum değişikliği dışındaki olaylar
alter table public.notifications add column kind text not null default 'durum';
alter table public.notifications drop constraint notifications_order_id_event_key;
alter table public.notifications add constraint notifications_order_event_kind_key unique (order_id, event, kind);

create or replace function public.enqueue_order_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    -- Aynı olay tekrar yaşanırsa (ör. sorunlu → yolda) yeniden gönderilir
    insert into public.notifications (order_id, event, kind)
    values (new.id, new.status, 'durum')
    on conflict (order_id, event, kind) do update
      set status = 'pending', attempts = 0, last_error = null, locked_at = null, created_at = now();
  end if;
  return new;
end $$;

-- Durum dışı olay bildirimi (event = siparişin o anki durumu)
create or replace function public.enqueue_order_event(p_order_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (order_id, event, kind)
  select id, status, p_kind from public.orders where id = p_order_id
  on conflict (order_id, event, kind) do update
    set status = 'pending', attempts = 0, last_error = null, locked_at = null, created_at = now();
end $$;
revoke execute on function public.enqueue_order_event from public, anon, authenticated;

create or replace function public.orders_arrival_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.arrived_pickup_at is null and new.arrived_pickup_at is not null then
    perform public.enqueue_order_event(new.id, 'varis_alis');
  end if;
  if old.arrived_dropoff_at is null and new.arrived_dropoff_at is not null then
    perform public.enqueue_order_event(new.id, 'varis_teslim');
  end if;
  return new;
end $$;
create trigger orders_arrival_notify after update of arrived_pickup_at, arrived_dropoff_at on public.orders
  for each row execute function public.orders_arrival_notify();

-- ───────── Bekleme ölçümü (durum tetikleyicisinden sonra)
create or replace function public.orders_waiting_measure()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'alindi' and old.status is distinct from 'alindi' and old.picked_up_at is null then
    if new.arrived_pickup_at is not null then
      new.waiting_minutes := greatest(0, floor(extract(epoch from (
        now() - greatest(new.arrived_pickup_at, coalesce(new.scheduled_pickup_at, new.arrived_pickup_at))
      )) / 60))::integer;
      new.waiting_source := 'olcum';
    elsif coalesce(new.waiting_minutes, 0) > 0 then
      new.waiting_source := 'elle';
    end if;
  end if;
  return new;
end $$;
create trigger orders_tw_waiting before update on public.orders
  for each row execute function public.orders_waiting_measure();

-- ───────── Elle varış: kurye "Vardım" der
create or replace function public.mark_arrived(
  p_order_id uuid,
  p_stop text,
  p_lat double precision default null,
  p_lng double precision default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  d double precision;
  max_r integer;
  is_adm boolean := public.is_admin();
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or not (is_adm or (o.courier_id = auth.uid() and public.current_role_is('kurye'))) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  if p_stop not in ('alis', 'teslim') then
    raise exception 'Durak geçersiz' using errcode = '22023';
  end if;
  if p_stop = 'alis' then
    if o.status <> 'kuryeye_atandi' then
      raise exception 'Alış adresine varış yalnız paket alınmadan önce bildirilir' using errcode = '22023';
    end if;
    if o.offer_expires_at is not null and o.offer_accepted_at is null then
      raise exception 'Önce işi kabul edin' using errcode = '22023';
    end if;
    if o.arrived_pickup_at is not null then
      return jsonb_build_object('ok', true, 'arrived_at', o.arrived_pickup_at);
    end if;
  else
    if o.status not in ('yolda', 'sorunlu') or o.picked_up_at is null then
      raise exception 'Teslim adresine varış paket yoldayken bildirilir' using errcode = '22023';
    end if;
    if o.arrived_dropoff_at is not null then
      return jsonb_build_object('ok', true, 'arrived_at', o.arrived_dropoff_at);
    end if;
  end if;

  if not is_adm then
    if p_lat is null or p_lng is null then
      raise exception 'Konumunuz alınamadı; konum iznini açıp tekrar deneyin' using errcode = '22023';
    end if;
    d := case when p_stop = 'alis' then public.distance_m(p_lat, p_lng, o.pickup_lat, o.pickup_lng)
              else public.distance_m(p_lat, p_lng, o.dropoff_lat, o.dropoff_lng) end;
    select arrival_max_radius_m into max_r from public.ops_settings where id = 1;
    if d > max_r then
      raise exception 'Adrese henüz varmadınız (yaklaşık % m uzaktasınız)', round(d)::integer using errcode = '22023';
    end if;
  end if;

  if p_stop = 'alis' then
    update public.orders set arrived_pickup_at = now() where id = p_order_id;
  else
    update public.orders set arrived_dropoff_at = now() where id = p_order_id;
  end if;
  return jsonb_build_object('ok', true, 'arrived_at', now());
end $$;
revoke execute on function public.mark_arrived from public, anon;
grant execute on function public.mark_arrived to authenticated;

-- ───────── Otomatik varış: konum adrese yeterince yaklaşınca (doğruluğu 100 m'den kötü konum sayılmaz)
create or replace function public.courier_location_geofence()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.orders;
  radius integer;
  at timestamptz := least(new.recorded_at, now());
begin
  if coalesce(new.accuracy_m, 0) > 100 then
    return new;
  end if;
  select arrival_auto_radius_m into radius from public.ops_settings where id = 1;
  for r in
    select * from public.orders
     where courier_id = new.courier_id
       and ((status = 'kuryeye_atandi' and arrived_pickup_at is null
             and (offer_expires_at is null or offer_accepted_at is not null))
         or (status = 'yolda' and arrived_dropoff_at is null))
  loop
    if r.status = 'kuryeye_atandi' and public.distance_m(new.lat, new.lng, r.pickup_lat, r.pickup_lng) <= radius then
      update public.orders set arrived_pickup_at = at where id = r.id;
    elsif r.status = 'yolda' and public.distance_m(new.lat, new.lng, r.dropoff_lat, r.dropoff_lng) <= radius then
      update public.orders set arrived_dropoff_at = at where id = r.id;
    end if;
  end loop;
  return new;
end $$;
create trigger courier_location_geofence after insert on public.courier_locations
  for each row execute function public.courier_location_geofence();
