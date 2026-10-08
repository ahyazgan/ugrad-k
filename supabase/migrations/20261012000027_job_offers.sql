-- İş teklifi: otomatik atamada iş kuryeye "teklif" olarak gider; kurye süre içinde kabul eder ya da reddeder.
--  • orders.offer_expires_at: teklifin son anı (null = doğrudan atama, ör. yönetici)
--  • orders.offer_accepted_at: kabul anı (doğrudan atamada atama anı)
--  • courier_offers: her teklifin sonucu (kabul / ret / zaman_asimi / geri_alindi) ve ret nedeni;
--    kabul oranı ve otomatik atamada "bu işi reddetti" bilgisi buradan gelir
--  • respond_offer(): kurye kabul/ret; expire_offers(): auto-dispatch süresi dolanları geri alır
-- Teklif bekleyen işte kurye paketi alamaz; müşteriye "kurye atandı" bildirimi kabulden sonra gider.

alter table public.ops_settings
  add column offer_enabled boolean not null default true,
  add column offer_timeout_seconds integer not null default 60 check (offer_timeout_seconds between 15 and 600);

alter table public.orders
  add column offer_expires_at timestamptz,
  add column offer_accepted_at timestamptz;

-- Mevcut atanmış işler doğrudan atama sayılır
update public.orders set offer_accepted_at = coalesce(assigned_at, now())
 where status in ('kuryeye_atandi', 'alindi', 'yolda', 'sorunlu', 'teslim_edildi') and courier_id is not null;

create table public.courier_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  courier_id uuid not null references public.couriers (id) on delete cascade,
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  response text check (response in ('kabul', 'ret', 'zaman_asimi', 'geri_alindi')),
  reason text,
  check ((responded_at is null) = (response is null))
);
create index courier_offers_courier_idx on public.courier_offers (courier_id, offered_at desc);
create index courier_offers_order_idx on public.courier_offers (order_id);
create unique index courier_offers_one_open on public.courier_offers (order_id) where responded_at is null;
alter table public.courier_offers enable row level security;
create policy courier_offers_read on public.courier_offers for select using (public.is_admin() or courier_id = auth.uid());

-- Atama türü: system_assign_courier "offer" ayarlar; diğer atamalar (yönetici) doğrudan kabul sayılır.
-- Durum tetikleyicisinden (courier_id temizliği) sonra çalışsın diye adı "tt".
create or replace function public.orders_offer_state()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'kuryeye_atandi'
     and (old.status is distinct from 'kuryeye_atandi' or old.courier_id is distinct from new.courier_id) then
    if current_setting('app.assign_mode', true) = 'offer' then
      new.offer_expires_at := now() + make_interval(secs => (select offer_timeout_seconds from public.ops_settings where id = 1));
      new.offer_accepted_at := null;
    else
      new.offer_expires_at := null;
      new.offer_accepted_at := now();
    end if;
  elsif old.status = 'kuryeye_atandi' and new.status is distinct from 'kuryeye_atandi' then
    if new.status in ('onaylandi', 'iptal') then
      new.offer_expires_at := null;
      new.offer_accepted_at := null;
    elsif old.offer_expires_at is not null and old.offer_accepted_at is null then
      -- Kabul edilmemiş teklifte kurye ilerleyemez; yönetici/sistem ilerletirse kabul sayılır
      if auth.uid() is not null and not public.is_admin() then
        raise exception 'Önce işi kabul edin' using errcode = '22023';
      end if;
      new.offer_accepted_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger orders_tt_offer before update on public.orders
  for each row execute function public.orders_offer_state();

-- Teklif kaydı: yeni teklif açılır, bekleyen teklif sonuçlanınca kapanır
create or replace function public.orders_offer_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  resp text;
begin
  if new.status is not distinct from old.status and new.courier_id is not distinct from old.courier_id
     and new.offer_accepted_at is not distinct from old.offer_accepted_at then
    return new;
  end if;
  -- Bekleyen teklif sonuçlandı mı?
  if old.status = 'kuryeye_atandi' and old.offer_expires_at is not null and old.offer_accepted_at is null
     and (new.status is distinct from 'kuryeye_atandi' or new.courier_id is distinct from old.courier_id
          or new.offer_accepted_at is not null) then
    if new.offer_accepted_at is not null and new.courier_id is not distinct from old.courier_id then
      resp := 'kabul';
    else
      resp := coalesce(nullif(current_setting('app.offer_response', true), ''),
                       case when auth.uid() = old.courier_id then 'ret' else 'geri_alindi' end);
    end if;
    update public.courier_offers
       set responded_at = now(), response = resp,
           reason = case when resp = 'kabul' then null else nullif(current_setting('app.offer_reason', true), '') end
     where order_id = new.id and responded_at is null;
  end if;
  -- Yeni teklif
  if new.status = 'kuryeye_atandi' and new.offer_expires_at is not null and new.offer_accepted_at is null
     and (old.status is distinct from 'kuryeye_atandi' or old.courier_id is distinct from new.courier_id) then
    update public.courier_offers set responded_at = now(), response = 'geri_alindi'
     where order_id = new.id and responded_at is null;
    insert into public.courier_offers (order_id, courier_id, expires_at)
    values (new.id, new.courier_id, new.offer_expires_at);
  end if;
  return new;
end $$;
create trigger orders_offer_log after update on public.orders
  for each row execute function public.orders_offer_log();

-- Sistem ataması: teklif açıksa teklif olarak gider
create or replace function public.system_assign_courier(p_order_id uuid, p_courier_id uuid, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (select 1 from public.couriers where id = p_courier_id and active and is_on_shift) then
    return false;
  end if;
  perform set_config('app.status_note', coalesce(p_note, 'Otomatik atama'), true);
  perform set_config('app.assign_mode',
    case when (select offer_enabled from public.ops_settings where id = 1) then 'offer' else 'direct' end, true);
  update public.orders
     set courier_id = p_courier_id, status = 'kuryeye_atandi'
   where id = p_order_id
     and status = 'onaylandi'
     and (payment_method <> 'kart' or payment_status = 'odendi');
  get diagnostics n = row_count;
  perform set_config('app.assign_mode', '', true);
  return n = 1;
end $$;

-- Kurye teklife yanıt verir. {ok, message}. Süresi dolmuş teklif kabul edilemez (10 sn ağ payı).
create or replace function public.respond_offer(
  p_order_id uuid,
  p_accept boolean,
  p_reason text default null,
  p_timeout boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  expired boolean;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.courier_id is distinct from auth.uid() or not public.current_role_is('kurye') then
    -- Daha önce bu kuryeye teklif edilmiş (reddedilmiş/süresi dolmuş/başkasına verilmiş) iş
    if exists (select 1 from public.courier_offers where order_id = p_order_id and courier_id = auth.uid()) then
      return jsonb_build_object('ok', false, 'message', 'Bu teklif artık geçerli değil');
    end if;
    raise exception 'Bu teklif size ait değil' using errcode = '42501';
  end if;
  if o.status <> 'kuryeye_atandi' or o.offer_expires_at is null or o.offer_accepted_at is not null then
    if p_accept and o.status = 'kuryeye_atandi' and o.offer_accepted_at is not null then
      return jsonb_build_object('ok', true, 'message', null);
    end if;
    return jsonb_build_object('ok', false, 'message', 'Bu teklif artık geçerli değil');
  end if;
  expired := now() > o.offer_expires_at + interval '10 seconds';
  if p_accept and not expired then
    update public.orders set offer_accepted_at = now() where id = p_order_id;
    -- "Kurye atandı" müşteri bildirimi kabulden sonra (teklif bildirimi gönderildiyse yeniden kuyruğa)
    update public.notifications
       set status = 'pending', attempts = 0, last_error = null, locked_at = null, created_at = now()
     where order_id = p_order_id and event = 'kuryeye_atandi' and status in ('sent', 'skipped', 'failed');
    return jsonb_build_object('ok', true, 'message', null);
  end if;
  perform set_config('app.offer_response', case when p_timeout or expired then 'zaman_asimi' else 'ret' end, true);
  perform set_config('app.offer_reason', coalesce(nullif(trim(p_reason), ''), ''), true);
  perform set_config('app.status_note',
    case when p_timeout or expired then 'Teklif süresi doldu'
         else 'Teklif reddedildi' || coalesce(': ' || nullif(trim(p_reason), ''), '') end, true);
  update public.orders set status = 'onaylandi' where id = p_order_id;
  perform set_config('app.offer_response', '', true);
  if p_accept then
    return jsonb_build_object('ok', false, 'message', 'Teklifin süresi doldu; iş başka kuryeye verilecek');
  end if;
  return jsonb_build_object('ok', true, 'message', null);
end $$;
revoke execute on function public.respond_offer from public, anon;
grant execute on function public.respond_offer to authenticated;

-- Süresi dolan teklifleri geri alır (auto-dispatch her dakika çağırır). 5 sn pay bırakılır.
create or replace function public.expire_offers()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  perform set_config('app.offer_response', 'zaman_asimi', true);
  perform set_config('app.status_note', 'Teklif süresi doldu', true);
  for r in
    select id from public.orders
     where status = 'kuryeye_atandi' and offer_accepted_at is null
       and offer_expires_at < now() - interval '5 seconds'
     for update skip locked
  loop
    update public.orders set status = 'onaylandi' where id = r.id;
    n := n + 1;
  end loop;
  perform set_config('app.offer_response', '', true);
  return n;
end $$;
revoke execute on function public.expire_offers from public, anon, authenticated;
grant execute on function public.expire_offers to service_role;
