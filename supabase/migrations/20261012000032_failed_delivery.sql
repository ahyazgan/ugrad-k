-- Teslim edilemedi → göndericiye iade.
--  • Kurye teslim adresine vardıktan (arrived_dropoff_at) sonra en az ops.failed_delivery_min_wait_minutes (10)
--    bekleyip alıcıyı aradıysa "Teslim edilemedi" der: neden, arama sayısı, kanıt fotoğrafı zorunlu
--    (alıcı reddettiyse / adres bulunamadıysa bekleme şartı yok). Sipariş geri_donuyor olur.
--  • İade ücreti packages/shared/pricing.ts applyFailedDeliveryReturn (dönüş ayağı kuralı, gidiş-dönüşte yok);
--    reprice-order uygular. Kurye göndericiye teslim edince (kanıtla) geri_teslim.
--  • orders.completed_at: teslim veya iade tamamlanma anı (hakediş, aylık fatura, raporlar)

insert into public.order_status_transitions (from_status, to_status) values
  ('yolda', 'geri_donuyor'),
  ('sorunlu', 'geri_donuyor'),
  ('geri_donuyor', 'geri_teslim'),
  ('geri_donuyor', 'sorunlu')
on conflict do nothing;

alter table public.ops_settings
  add column failed_delivery_min_wait_minutes integer not null default 10 check (failed_delivery_min_wait_minutes between 0 and 60);

alter table public.orders
  add column failed_reason text check (failed_reason in ('alici_yok', 'adres_bulunamadi', 'alici_reddetti', 'kapali', 'diger')),
  add column failed_note text,
  add column failed_at timestamptz,
  add column failed_photo_path text,
  add column failed_call_attempts smallint,
  add column returned_at timestamptz,
  -- Göndericiye iade kanıtı (teslim kanıtından ayrı)
  add column return_pod_photo_path text,
  add column return_pod_signature_path text,
  add column return_receiver_name text,
  add column completed_at timestamptz;

update public.orders set completed_at = delivered_at where status = 'teslim_edildi' and completed_at is null;
create index orders_completed_idx on public.orders (completed_at) where completed_at is not null;

-- Tamamlanma ve iade zamanları (durum tetikleyicisinden sonra)
create or replace function public.orders_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'teslim_edildi' then
      new.completed_at := coalesce(new.delivered_at, now());
    elsif new.status = 'geri_teslim' then
      new.returned_at := now();
      new.completed_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger orders_tu_completion before update on public.orders
  for each row execute function public.orders_completion();

-- Kuryenin canlı konumu iade sırasında da müşteriye görünür
create or replace function public.is_active_delivery_status(s public.order_status)
returns boolean language sql immutable as $$
  select s in ('kuryeye_atandi', 'alindi', 'yolda', 'geri_donuyor');
$$;

-- Kurye iade sırasında da kanıt yükleyebilir
drop policy pod_courier_upload on storage.objects;
create policy pod_courier_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'pod'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.courier_id = auth.uid()
        and o.status in ('kuryeye_atandi', 'alindi', 'yolda', 'sorunlu', 'geri_donuyor')
    )
  );

-- Teslim edilemedi: kurallar burada, ücret reprice-order'da
create or replace function public.report_failed_delivery(
  p_order_id uuid,
  p_reason text,
  p_note text,
  p_photo_path text,
  p_call_attempts integer default 0
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  min_wait integer;
  waited numeric;
begin
  select * into o from public.orders where id = p_order_id for update;
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
      waited := extract(epoch from (now() - o.arrived_dropoff_at)) / 60;
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
    failed_at = now(),
    failed_photo_path = nullif(trim(coalesce(p_photo_path, '')), ''),
    failed_call_attempts = greatest(0, coalesce(p_call_attempts, 0))
  where id = p_order_id
  returning * into o;
  return o;
end $$;
revoke execute on function public.report_failed_delivery from public, anon;
grant execute on function public.report_failed_delivery to authenticated;

-- set_order_status: kurye iadeyi (geri_teslim) kanıtla kapatır; kuryeye ödemeli ödenmemiş siparişte tahsilat bilgisi
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_note text default null,
  p_waiting_minutes integer default null,
  p_pod_photo_path text default null,
  p_pod_signature_path text default null,
  p_pod_receiver_name text default null,
  p_cash_collection text default null
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
    cash_collected_at = case when o.payment_method = 'nakit' and p_cash_collection is not null then now() else cash_collected_at end,
    payment_status = case
      when o.payment_method = 'nakit' and p_cash_collection = 'nakit' then 'odendi'::public.payment_status
      else payment_status end,
    paid_kurus = case
      when o.payment_method = 'nakit' and p_cash_collection = 'nakit' then o.total_kurus
      else paid_kurus end,
    paid_at = case
      when o.payment_method = 'nakit' and p_cash_collection = 'nakit' then now()
      else paid_at end
  where id = p_order_id
  returning * into o;

  return o;
end $$;
revoke execute on function public.set_order_status from public, anon;
grant execute on function public.set_order_status to authenticated;

-- Hakediş: iade edilen gönderide de kurye kazanır (dönüş km'si teklife eklenir)
create or replace function public.pending_courier_earnings(p_limit integer default 200)
returns setof public.orders language sql stable security definer set search_path = public as $$
  select o.* from public.orders o
  where o.status in ('teslim_edildi', 'geri_teslim') and o.courier_id is not null
    and not exists (select 1 from public.courier_earnings e where e.order_id = o.id)
  order by o.completed_at
  limit p_limit;
$$;

-- Bireysel fatura: iade edilen gönderi de faturalanır (hizmet verildi)
create or replace function public.enqueue_order_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
begin
  if new.status in ('teslim_edildi', 'geri_teslim') and old.status is distinct from new.status
     and new.corporate_account_id is null then
    select * into p from public.profiles where id = new.customer_id;
    insert into public.invoices (kind, order_id, buyer, description, subtotal_kurus, vat_pct, vat_kurus, total_kurus)
    values (
      'order',
      new.id,
      jsonb_build_object(
        'type', 'person',
        'name', coalesce(nullif(p.full_name, ''), 'Nihai Tüketici'),
        'tax_number', '11111111111',
        'email', p.email,
        'phone', p.phone,
        'address', new.pickup_address
      ),
      'Kurye hizmeti ' || new.order_no || case when new.status = 'geri_teslim' then ' (teslim edilemedi, iade)' else '' end,
      new.subtotal_kurus,
      case when new.subtotal_kurus > 0 then round(new.vat_kurus * 100.0 / new.subtotal_kurus) else 20 end,
      new.vat_kurus,
      new.total_kurus
    )
    on conflict (order_id) do nothing;
  end if;
  return new;
end $$;
