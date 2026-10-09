-- Çevrimdışı çalışma: kurye uygulaması bağlantı yokken yaptığı işlemleri (paketi aldım, yola çıktım,
-- teslim, vardım, teslim edilemedi, konum) telefonda kuyruğa alır, bağlantı gelince gönderir.
-- İşlemin GERÇEKLEŞTİĞİ an kaydedilir (taahhüt, bekleme ücreti, BTK için doğru zaman):
--  • set_order_status / mark_arrived / report_failed_delivery yeni isteğe bağlı p_occurred_at / p_at
--  • Zaman sınırlanır: en fazla 6 saat geriye, gelecek olamaz, siparişin son durum değişikliğinden önce olamaz
--  • Durum, geçmiş, tamamlanma ve bekleme tetikleyicileri bu zamanı kullanır (public.event_time())
--  • courier_locations.recorded_at istemciden gelebilir (6 saat sınırı); eski konum son konumu ezmez

create or replace function public.event_time()
returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('app.occurred_at', true), '')::timestamptz, now());
$$;

-- İşlem zamanını (bu işlem için) ayarlar; null ise şimdi
create or replace function public.set_event_time(p_order_id uuid, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  last_at timestamptz;
  t timestamptz;
begin
  if p_at is null then
    perform set_config('app.occurred_at', '', true);
    return;
  end if;
  select max(created_at) into last_at from public.order_status_history where order_id = p_order_id;
  t := greatest(least(p_at, now()), now() - interval '6 hours', coalesce(last_at, now() - interval '6 hours'));
  perform set_config('app.occurred_at', t::text, true);
end $$;
revoke execute on function public.set_event_time from public, anon, authenticated;

create or replace function public.orders_status_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not exists (
      select 1 from public.order_status_transitions
      where from_status = old.status and to_status = new.status
    ) then
      raise exception 'Geçersiz durum geçişi: % → %', old.status, new.status using errcode = '22023';
    end if;
    if new.status = 'kuryeye_atandi' and new.courier_id is null then
      raise exception 'Kurye atanmadan sipariş kuryeye_atandi olamaz' using errcode = '22023';
    end if;
    case new.status
      when 'kuryeye_atandi' then new.assigned_at := public.event_time();
      when 'alindi' then new.picked_up_at := coalesce(new.picked_up_at, public.event_time());
      when 'teslim_edildi' then new.delivered_at := public.event_time();
      when 'iptal' then new.cancelled_at := public.event_time();
      when 'onaylandi' then
        if old.status = 'kuryeye_atandi' then new.courier_id := null; new.assigned_at := null; end if;
      else null;
    end case;
  end if;
  return new;
end $$;

create or replace function public.orders_status_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by, note, created_at)
    values (new.id, old.status, new.status, auth.uid(),
            nullif(current_setting('app.status_note', true), ''), public.event_time());
  end if;
  return new;
end $$;

create or replace function public.orders_waiting_measure()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'alindi' and old.status is distinct from 'alindi' and old.picked_up_at is null then
    if new.arrived_pickup_at is not null then
      new.waiting_minutes := greatest(0, floor(extract(epoch from (
        public.event_time() - greatest(new.arrived_pickup_at, coalesce(new.scheduled_pickup_at, new.arrived_pickup_at))
      )) / 60))::integer;
      new.waiting_source := 'olcum';
    elsif coalesce(new.waiting_minutes, 0) > 0 then
      new.waiting_source := 'elle';
    end if;
  end if;
  return new;
end $$;

create or replace function public.orders_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'teslim_edildi' then
      new.completed_at := coalesce(new.delivered_at, public.event_time());
    elsif new.status = 'geri_teslim' then
      new.returned_at := public.event_time();
      new.completed_at := public.event_time();
    end if;
  end if;
  return new;
end $$;

create or replace function public.courier_location_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.couriers
     set last_lat = new.lat, last_lng = new.lng, last_location_at = new.recorded_at
   where id = new.courier_id
     -- Geç gelen (çevrimdışı biriken) eski konum son konumu geri almaz
     and (last_location_at is null or last_location_at <= new.recorded_at);
  return new;
end $$;

-- İstemci konum zamanı: gelecek olamaz, 6 saatten eski kabul edilmez
create or replace function public.courier_location_time()
returns trigger language plpgsql as $$
begin
  if new.recorded_at > now() + interval '1 minute' then
    new.recorded_at := now();
  end if;
  if new.recorded_at < now() - interval '6 hours' then
    raise exception 'Konum çok eski' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger courier_location_time before insert on public.courier_locations
  for each row execute function public.courier_location_time();

-- İmzalar değişti: eski sürümler kaldırılır (adlandırılmış parametreli çağrılar belirsiz kalmasın)
drop function public.set_order_status(uuid, public.order_status, text, integer, text, text, text, text);
drop function public.mark_arrived(uuid, text, double precision, double precision);
drop function public.report_failed_delivery(uuid, text, text, text, integer);

create or replace function public.set_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_note text default null,
  p_waiting_minutes integer default null,
  p_pod_photo_path text default null,
  p_pod_signature_path text default null,
  p_pod_receiver_name text default null,
  p_cash_collection text default null,
  p_occurred_at timestamptz default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  sec public.order_secrets;
  uid uuid := auth.uid();
  is_adm boolean := public.is_admin();
  closing boolean := p_status in ('teslim_edildi', 'geri_teslim');
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
        p_status in ('alindi', 'yolda', 'teslim_edildi', 'sorunlu', 'geri_teslim')
        or (p_status = 'onaylandi' and o.status = 'kuryeye_atandi')
      ) then
        raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
      end if;
    else
      raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
    end if;
  end if;

  -- Kurye teslimde/iadede kanıt yüklemek zorunda; yönetici kanıtsız kapatabilir
  if closing and not is_adm
     and coalesce(p_pod_photo_path, p_pod_signature_path,
                  case when p_status = 'teslim_edildi' then coalesce(o.pod_photo_path, o.pod_signature_path) end) is null then
    raise exception 'Teslim için fotoğraf veya imza gerekli' using errcode = '22023';
  end if;
  -- Teslim kodu istenen siparişte kod doğrulanmış olmalı (verify_delivery_code); iadede kod sorulmaz
  if p_status = 'teslim_edildi' and not is_adm and o.delivery_code_required then
    select * into sec from public.order_secrets where order_id = o.id;
    if sec.order_id is not null and sec.verified_at is null then
      raise exception 'Alıcının teslim kodu doğrulanmadı' using errcode = '22023';
    end if;
  end if;
  if p_cash_collection is not null and p_cash_collection not in ('nakit', 'iban', 'alinmadi') then
    raise exception 'Tahsilat şekli geçersiz' using errcode = '22023';
  end if;
  if closing and not is_adm and o.payment_method = 'nakit'
     and o.payment_status <> 'odendi' and p_cash_collection is null then
    raise exception 'Kuryeye ödemeli siparişte tahsilat bilgisi gerekli' using errcode = '22023';
  end if;
  if p_status in ('iptal', 'sorunlu') and nullif(trim(coalesce(p_note, '')), '') is null and not is_adm then
    raise exception 'Lütfen bir açıklama girin' using errcode = '22023';
  end if;
  if p_waiting_minutes is not null and p_waiting_minutes < 0 then
    raise exception 'Bekleme süresi geçersiz' using errcode = '22023';
  end if;

  perform set_config('app.status_note', coalesce(p_note, ''), true);
  -- Çevrimdışı kaydedilen işlem: gerçekleştiği an (sınırlı)
  perform public.set_event_time(p_order_id, p_occurred_at);

  update public.orders set
    status = p_status,
    waiting_minutes = coalesce(p_waiting_minutes, waiting_minutes),
    -- İadede kanıt teslimin yerine geçmez: ayrı alanlara yazılmaz, not olarak geçmişte kalır
    pod_photo_path = case when p_status = 'geri_teslim' then pod_photo_path else coalesce(p_pod_photo_path, pod_photo_path) end,
    pod_signature_path = case when p_status = 'geri_teslim' then pod_signature_path else coalesce(p_pod_signature_path, pod_signature_path) end,
    pod_receiver_name = case when p_status = 'geri_teslim' then pod_receiver_name else coalesce(p_pod_receiver_name, pod_receiver_name) end,
    return_pod_photo_path = case when p_status = 'geri_teslim' then coalesce(p_pod_photo_path, return_pod_photo_path) else return_pod_photo_path end,
    return_pod_signature_path = case when p_status = 'geri_teslim' then coalesce(p_pod_signature_path, return_pod_signature_path) else return_pod_signature_path end,
    return_receiver_name = case when p_status = 'geri_teslim' then coalesce(p_pod_receiver_name, return_receiver_name) else return_receiver_name end,
    cancel_reason = case when p_status = 'iptal' then p_note else cancel_reason end,
    problem_note = case when p_status = 'sorunlu' then p_note else problem_note end,
    cash_collection = case when o.payment_method = 'nakit' then coalesce(p_cash_collection, cash_collection) else cash_collection end,
    cash_collected_at = case when o.payment_method = 'nakit' and p_cash_collection is not null then public.event_time() else cash_collected_at end,
    payment_status = case
      when o.payment_method = 'nakit' and p_cash_collection = 'nakit' then 'odendi'::public.payment_status
      else payment_status end,
    paid_kurus = case
      when o.payment_method = 'nakit' and p_cash_collection = 'nakit' then o.total_kurus
      else paid_kurus end,
    paid_at = case
      when o.payment_method = 'nakit' and p_cash_collection = 'nakit' then public.event_time()
      else paid_at end
  where id = p_order_id
  returning * into o;

  perform set_config('app.occurred_at', '', true);
  return o;
end $$;

create or replace function public.mark_arrived(
  p_order_id uuid,
  p_stop text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  d double precision;
  max_r integer;
  arrived timestamptz;
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

  perform public.set_event_time(p_order_id, p_at);
  if p_stop = 'alis' then
    update public.orders set arrived_pickup_at = public.event_time() where id = p_order_id;
  else
    update public.orders set arrived_dropoff_at = public.event_time() where id = p_order_id;
  end if;
  arrived := public.event_time();
  perform set_config('app.occurred_at', '', true);
  return jsonb_build_object('ok', true, 'arrived_at', arrived);
end $$;

create or replace function public.report_failed_delivery(
  p_order_id uuid,
  p_reason text,
  p_note text,
  p_photo_path text,
  p_call_attempts integer default 0,
  p_occurred_at timestamptz default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  min_wait integer;
  waited numeric;
begin
  select * into o from public.orders where id = p_order_id for update;
  perform public.set_event_time(p_order_id, p_occurred_at);
  if not found or not (public.is_admin() or (o.courier_id = auth.uid() and public.current_role_is('kurye'))) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  if o.status not in ('yolda', 'sorunlu') or o.picked_up_at is null then
    raise exception 'Teslim edilemedi yalnız paket yoldayken bildirilir' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in ('alici_yok', 'adres_bulunamadi', 'alici_reddetti', 'kapali', 'diger') then
    raise exception 'Neden seçin' using errcode = '22023';
  end if;
  if not public.is_admin() then
    if nullif(trim(coalesce(p_photo_path, '')), '') is null then
      raise exception 'Adresin fotoğrafını çekin (kanıt)' using errcode = '22023';
    end if;
    if p_reason in ('alici_yok', 'kapali', 'diger') then
      if o.arrived_dropoff_at is null then
        raise exception 'Önce teslim adresine vardığınızı bildirin' using errcode = '22023';
      end if;
      select failed_delivery_min_wait_minutes into min_wait from public.ops_settings where id = 1;
      waited := extract(epoch from (public.event_time() - o.arrived_dropoff_at)) / 60;
      if waited < min_wait then
        raise exception 'Alıcıyı en az % dakika bekleyin (% dk kaldı)', min_wait, ceil(min_wait - waited)::integer using errcode = '22023';
      end if;
    end if;
    if p_reason = 'alici_yok' and coalesce(p_call_attempts, 0) < 1 then
      raise exception 'Alıcıyı en az bir kez arayın' using errcode = '22023';
    end if;
    if p_reason = 'diger' and nullif(trim(coalesce(p_note, '')), '') is null then
      raise exception 'Lütfen bir açıklama girin' using errcode = '22023';
    end if;
  end if;
  perform set_config('app.status_note', 'Teslim edilemedi: ' || p_reason || coalesce(' — ' || nullif(trim(p_note), ''), ''), true);
  update public.orders set
    status = 'geri_donuyor',
    failed_reason = p_reason,
    failed_note = nullif(trim(coalesce(p_note, '')), ''),
    failed_at = public.event_time(),
    failed_photo_path = nullif(trim(coalesce(p_photo_path, '')), ''),
    failed_call_attempts = greatest(0, coalesce(p_call_attempts, 0))
  where id = p_order_id
  returning * into o;
  perform set_config('app.occurred_at', '', true);
  return o;
end $$;

revoke execute on function public.set_order_status from public, anon;
grant execute on function public.set_order_status to authenticated;
revoke execute on function public.mark_arrived from public, anon;
grant execute on function public.mark_arrived to authenticated;
revoke execute on function public.report_failed_delivery from public, anon;
grant execute on function public.report_failed_delivery to authenticated;
