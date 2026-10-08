-- Acil durum (SOS): kurye tek tuşla konumuyla yöneticiye alarm verir.
--  • courier_incidents: tür, konum, not, o anki aktif iş; yönetici "gördüm" (acknowledged) ve "kapat" (resolved)
--  • raise_sos(): sos Edge Function'ı çağırır (servis rolü); kurye molaya alınır (yeni iş gelmez)
--  • Görülmeyen alarm auto-dispatch tarafından 5 dakikada bir, en fazla 3 kez yeniden gönderilir
--  • Panel üst bandında açık alarmlar canlı görünür (Realtime)

create table public.courier_incidents (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.couriers (id) on delete cascade,
  kind text not null check (kind in ('kaza', 'tehlike', 'saglik', 'arac_ariza', 'diger')),
  note text check (note is null or length(note) <= 500),
  lat double precision,
  lng double precision,
  accuracy_m real,
  order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  alert_count smallint not null default 0,
  last_alert_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text
);
create index courier_incidents_open_idx on public.courier_incidents (created_at) where resolved_at is null;
create index courier_incidents_courier_idx on public.courier_incidents (courier_id, created_at desc);
alter table public.courier_incidents enable row level security;
create policy courier_incidents_read on public.courier_incidents for select using (public.is_admin() or courier_id = auth.uid());
alter publication supabase_realtime add table public.courier_incidents;

-- Alarm kaydı: aynı kuryenin 2 dakika içindeki ikinci basışı yeni kayıt açmaz (konum güncellenir)
create or replace function public.raise_sos(
  p_courier_id uuid,
  p_kind text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy real default null,
  p_note text default null
) returns public.courier_incidents
language plpgsql security definer set search_path = public as $$
declare
  i public.courier_incidents;
  active uuid;
begin
  if not exists (select 1 from public.couriers where id = p_courier_id) then
    raise exception 'Kurye bulunamadı' using errcode = '42501';
  end if;
  select * into i from public.courier_incidents
   where courier_id = p_courier_id and resolved_at is null and created_at > now() - interval '2 minutes'
   order by created_at desc limit 1;
  if found then
    update public.courier_incidents
       set lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng), accuracy_m = coalesce(p_accuracy, accuracy_m),
           note = coalesce(nullif(trim(p_note), ''), note)
     where id = i.id returning * into i;
    return i;
  end if;
  select id into active from public.orders
   where courier_id = p_courier_id and status in ('yolda', 'alindi', 'kuryeye_atandi')
   order by case status when 'yolda' then 0 when 'alindi' then 1 else 2 end limit 1;
  insert into public.courier_incidents (courier_id, kind, note, lat, lng, accuracy_m, order_id)
  values (p_courier_id, p_kind, nullif(trim(p_note), ''), p_lat, p_lng, p_accuracy, active)
  returning * into i;
  -- Yeni iş gelmesin (vardiyadaysa molaya alınır, bekleyen teklifler geri alınır)
  if exists (select 1 from public.courier_shifts where courier_id = p_courier_id and ended_at is null) then
    perform public.begin_break(p_courier_id, false);
  end if;
  return i;
end $$;
revoke execute on function public.raise_sos from public, anon, authenticated;
grant execute on function public.raise_sos to service_role;

create or replace function public.acknowledge_incident(p_id uuid)
returns public.courier_incidents language plpgsql security definer set search_path = public as $$
declare i public.courier_incidents;
begin
  if not public.is_admin() then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  update public.courier_incidents set acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, auth.uid())
   where id = p_id returning * into i;
  return i;
end $$;

create or replace function public.resolve_incident(p_id uuid, p_note text)
returns public.courier_incidents language plpgsql security definer set search_path = public as $$
declare i public.courier_incidents;
begin
  if not public.is_admin() then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Kapatmak için ne yapıldığını yazın' using errcode = '22023';
  end if;
  update public.courier_incidents
     set resolved_at = now(), resolved_by = auth.uid(), resolution_note = trim(p_note),
         acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, auth.uid())
   where id = p_id and resolved_at is null returning * into i;
  if i.id is null then
    raise exception 'Kayıt bulunamadı veya zaten kapalı' using errcode = '22023';
  end if;
  return i;
end $$;
revoke execute on function public.acknowledge_incident from public, anon;
revoke execute on function public.resolve_incident from public, anon;
grant execute on function public.acknowledge_incident to authenticated;
grant execute on function public.resolve_incident to authenticated;
