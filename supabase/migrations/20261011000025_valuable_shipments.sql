-- Değerli gönderiler: değer beyanı sigortası ve teslim kodu.
--  • pricing_settings: ücretsiz sorumluluk sınırı, sigorta oranı, en düşük ücret, en yüksek beyan (pricing.ts)
--  • orders.declared_value_kurus, orders.delivery_code_required
--  • order_secrets: 4 haneli teslim kodu. Kurye göremez; müşteri kendi siparişinin kodunu görür, alıcıya
--    "yolda" bildirimiyle SMS/WhatsApp ile gider. Kurye teslimde kodu verify_delivery_code ile doğrular
--    (5 hatalı denemede kilitlenir); doğrulanmadan teslim kapanmaz (yönetici kapatabilir).

alter table public.pricing_settings
  add column free_coverage_kurus integer not null default 100000 check (free_coverage_kurus >= 0),
  add column insurance_rate_pct numeric(5, 2) not null default 0.5 check (insurance_rate_pct between 0 and 20),
  add column insurance_min_kurus integer not null default 2500 check (insurance_min_kurus >= 0),
  add column max_declared_value_kurus integer default 10000000 check (max_declared_value_kurus is null or max_declared_value_kurus > 0);

alter table public.orders
  add column declared_value_kurus integer check (declared_value_kurus is null or declared_value_kurus > 0),
  add column delivery_code_required boolean not null default false;

create table public.order_secrets (
  order_id uuid primary key references public.orders (id) on delete cascade,
  delivery_code text not null check (delivery_code ~ '^[0-9]{4}$'),
  failed_attempts smallint not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.order_secrets enable row level security;
create policy order_secrets_admin on public.order_secrets for select using (public.is_admin());
create policy order_secrets_customer on public.order_secrets for select using (
  exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
);

-- Kod istenen siparişte kod otomatik üretilir
create or replace function public.create_delivery_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.delivery_code_required then
    insert into public.order_secrets (order_id, delivery_code)
    values (new.id, lpad((floor(random() * 10000))::int::text, 4, '0'))
    on conflict (order_id) do nothing;
  end if;
  return new;
end $$;
create trigger orders_create_delivery_code after insert or update of delivery_code_required on public.orders
  for each row execute function public.create_delivery_code();

-- Kurye alıcıdan aldığı kodu doğrular: {ok, remaining}. Yanlış deneme sayılır, 5'te kilit.
create or replace function public.verify_delivery_code(p_order_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  sec public.order_secrets;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or not (public.is_admin() or (o.courier_id = auth.uid() and public.current_role_is('kurye'))) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  select * into sec from public.order_secrets where order_id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', true, 'remaining', 5);
  end if;
  if sec.verified_at is not null then
    return jsonb_build_object('ok', true, 'remaining', 5 - sec.failed_attempts);
  end if;
  if sec.failed_attempts >= 5 then
    raise exception 'Teslim kodu 5 kez yanlış girildi; yöneticiyi arayın' using errcode = '22023';
  end if;
  if trim(coalesce(p_code, '')) = sec.delivery_code then
    update public.order_secrets set verified_at = now() where order_id = p_order_id;
    return jsonb_build_object('ok', true, 'remaining', 5 - sec.failed_attempts);
  end if;
  update public.order_secrets set failed_attempts = failed_attempts + 1 where order_id = p_order_id;
  return jsonb_build_object('ok', false, 'remaining', 4 - sec.failed_attempts);
end $$;
revoke execute on function public.verify_delivery_code from public, anon;
grant execute on function public.verify_delivery_code to authenticated;

-- set_order_status: teslim kodu kontrolü eklendi (yönetici kodsuz kapatabilir)
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
  -- Teslim kodu istenen siparişte kod doğrulanmış olmalı (verify_delivery_code)
  if p_status = 'teslim_edildi' and not is_adm and o.delivery_code_required then
    select * into sec from public.order_secrets where order_id = o.id;
    if sec.order_id is not null and sec.verified_at is null then
      raise exception 'Alıcının teslim kodu doğrulanmadı' using errcode = '22023';
    end if;
  end if;
  if p_cash_collection is not null and p_cash_collection not in ('nakit', 'iban', 'alinmadi') then
    raise exception 'Tahsilat şekli geçersiz' using errcode = '22023';
  end if;
  if p_status = 'teslim_edildi' and not is_adm and o.payment_method = 'nakit'
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
    pod_photo_path = coalesce(p_pod_photo_path, pod_photo_path),
    pod_signature_path = coalesce(p_pod_signature_path, pod_signature_path),
    pod_receiver_name = coalesce(p_pod_receiver_name, pod_receiver_name),
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
