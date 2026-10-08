-- Vardiya planlama: kurye önümüzdeki 14 günün zaman dilimlerinden vardiya seçer, panel hangi saatte
-- kaç kurye olacağını görür.
--  • shift_templates: haftanın günü × zaman dilimi ve gereken kurye sayısı (panelden)
--  • shift_bookings: kuryenin seçtiği dilim (İstanbul saatiyle başlangıç/bitiş); dilim dolunca alınamaz;
--    başlangıca 2 saatten az kala iptal "geç iptal" sayılır
--  • Hatırlatma (60 dk önce) ve gelmedi bildirimi (başlangıçtan 15 dk sonra vardiya açılmadıysa):
--    auto-dispatch (shift_reminders_due / shift_no_shows_due)
--  • Katılım: dilim ile gerçek vardiya (courier_shifts) en az yarısı kadar örtüşüyorsa "geldi"

create table public.shift_templates (
  id serial primary key,
  weekday smallint not null check (weekday between 1 and 7), -- 1 = Pazartesi … 7 = Pazar
  start_time time not null,
  end_time time not null check (end_time > start_time),
  required smallint not null default 1 check (required between 0 and 50),
  active boolean not null default true,
  unique (weekday, start_time)
);
alter table public.shift_templates enable row level security;
create policy shift_templates_read on public.shift_templates for select using (auth.uid() is not null);
create policy shift_templates_admin on public.shift_templates for all using (public.is_admin()) with check (public.is_admin());

-- Varsayılan: hafta içi ve Cumartesi 08–12, 12–16, 16–20 (2 kurye), 20–24 (1); Pazar 10–14, 14–18, 18–22 (1)
insert into public.shift_templates (weekday, start_time, end_time, required)
select d, s, e, r
  from generate_series(1, 6) d,
       (values ('08:00'::time, '12:00'::time, 2), ('12:00', '16:00', 2), ('16:00', '20:00', 2), ('20:00', '24:00', 1)) t(s, e, r)
union all
select 7, s, e, 1 from (values ('10:00'::time, '14:00'::time), ('14:00', '18:00'), ('18:00', '22:00')) t(s, e);

create table public.shift_bookings (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.couriers (id) on delete cascade,
  template_id integer references public.shift_templates (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  late_cancel boolean not null default false,
  reminded_at timestamptz,
  no_show_alerted_at timestamptz
);
create unique index shift_bookings_one on public.shift_bookings (courier_id, starts_at) where cancelled_at is null;
create index shift_bookings_time_idx on public.shift_bookings (starts_at) where cancelled_at is null;
alter table public.shift_bookings enable row level security;
-- Kurye kendi vardiyalarını görür; dilim doluluğu shift_slots() ile
create policy shift_bookings_read on public.shift_bookings for select using (public.is_admin() or courier_id = auth.uid());

-- İstanbul gün + saat → zaman damgası
create or replace function public.istanbul_ts(d date, t time)
returns timestamptz language sql immutable as $$
  select (d + t) at time zone 'Europe/Istanbul';
$$;

-- Önümüzdeki günlerin dilimleri, gereken ve alınan sayı, çağıranın aldığı (kurye ve yönetici okur)
create or replace function public.shift_slots(p_from date, p_days integer default 14)
returns table (template_id integer, day date, starts_at timestamptz, ends_at timestamptz, required smallint, booked integer, mine boolean, booking_id uuid)
language sql stable security definer set search_path = public as $$
  select t.id, d::date,
         public.istanbul_ts(d::date, t.start_time),
         public.istanbul_ts(d::date, t.end_time),
         t.required,
         (select count(*)::integer from public.shift_bookings b
           where b.cancelled_at is null and b.starts_at = public.istanbul_ts(d::date, t.start_time)),
         exists (select 1 from public.shift_bookings b
                  where b.cancelled_at is null and b.courier_id = auth.uid()
                    and b.starts_at = public.istanbul_ts(d::date, t.start_time)),
         (select b.id from public.shift_bookings b
           where b.cancelled_at is null and b.courier_id = auth.uid()
             and b.starts_at = public.istanbul_ts(d::date, t.start_time) limit 1)
    from generate_series(p_from, p_from + (least(greatest(p_days, 1), 31) - 1), interval '1 day') d
    join public.shift_templates t on t.active and t.weekday = extract(isodow from d)::smallint
   where auth.uid() is not null
   order by 3;
$$;
revoke execute on function public.shift_slots from public, anon;
grant execute on function public.shift_slots to authenticated;

-- Dilim al: kurye kendisi için; yönetici bir kurye adına (p_courier_id)
create or replace function public.book_shift(p_template_id integer, p_day date, p_courier_id uuid default null)
returns public.shift_bookings
language plpgsql security definer set search_path = public as $$
declare
  t public.shift_templates;
  who uuid := coalesce(p_courier_id, auth.uid());
  is_adm boolean := public.is_admin();
  s timestamptz;
  b public.shift_bookings;
  taken integer;
begin
  if not is_adm and (p_courier_id is not null and p_courier_id <> auth.uid() or not public.current_role_is('kurye')) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  if not exists (select 1 from public.couriers where id = who and active) then
    raise exception 'Aktif kurye bulunamadı' using errcode = '22023';
  end if;
  select * into t from public.shift_templates where id = p_template_id and active;
  if not found or t.weekday <> extract(isodow from p_day) then
    raise exception 'Bu gün için böyle bir vardiya yok' using errcode = '22023';
  end if;
  s := public.istanbul_ts(p_day, t.start_time);
  if not is_adm and (s < now() or s > now() + interval '14 days') then
    raise exception 'Vardiya ancak önümüzdeki 14 gün için alınabilir' using errcode = '22023';
  end if;
  -- Aynı anda tek alım (dolu kontrolü yarışmasın)
  perform pg_advisory_xact_lock(hashtext('shift:' || s::text));
  select * into b from public.shift_bookings where courier_id = who and starts_at = s and cancelled_at is null;
  if found then
    return b;
  end if;
  select count(*) into taken from public.shift_bookings where starts_at = s and cancelled_at is null;
  if not is_adm and taken >= t.required then
    raise exception 'Bu vardiya dolu' using errcode = '22023';
  end if;
  insert into public.shift_bookings (courier_id, template_id, starts_at, ends_at, created_by)
  values (who, t.id, s, public.istanbul_ts(p_day, t.end_time), auth.uid())
  returning * into b;
  return b;
end $$;
revoke execute on function public.book_shift from public, anon;
grant execute on function public.book_shift to authenticated;

-- İptal: başlangıca 2 saatten az kala kurye iptali "geç iptal" (performansa yansır)
create or replace function public.cancel_shift_booking(p_booking_id uuid)
returns public.shift_bookings
language plpgsql security definer set search_path = public as $$
declare
  b public.shift_bookings;
  is_adm boolean := public.is_admin();
begin
  select * into b from public.shift_bookings where id = p_booking_id and cancelled_at is null for update;
  if not found or not (is_adm or b.courier_id = auth.uid()) then
    raise exception 'Vardiya bulunamadı' using errcode = 'P0002';
  end if;
  if not is_adm and b.starts_at < now() then
    raise exception 'Başlamış vardiya iptal edilemez; yöneticinizi arayın' using errcode = '22023';
  end if;
  update public.shift_bookings
     set cancelled_at = now(), late_cancel = not is_adm and b.starts_at < now() + interval '2 hours'
   where id = p_booking_id
  returning * into b;
  return b;
end $$;
revoke execute on function public.cancel_shift_booking from public, anon;
grant execute on function public.cancel_shift_booking to authenticated;

-- Hatırlatma zamanı gelenler (55–65 dk sonra başlayan, hatırlatılmamış) — auto-dispatch işaretler
create or replace function public.shift_reminders_due()
returns setof public.shift_bookings language sql stable security definer set search_path = public as $$
  select * from public.shift_bookings
   where cancelled_at is null and reminded_at is null
     and starts_at between now() + interval '50 minutes' and now() + interval '65 minutes';
$$;

-- Gelmeyenler: başlangıçtan 15 dk geçti, vardiya açılmadı, bildirilmedi
create or replace function public.shift_no_shows_due()
returns setof public.shift_bookings language sql stable security definer set search_path = public as $$
  select b.* from public.shift_bookings b
   where b.cancelled_at is null and b.no_show_alerted_at is null
     and b.starts_at < now() - interval '15 minutes' and b.ends_at > now()
     and not exists (
       select 1 from public.courier_shifts s
        where s.courier_id = b.courier_id and s.started_at < b.ends_at and coalesce(s.ended_at, now()) > b.starts_at
     );
$$;
revoke execute on function public.shift_reminders_due from public, anon, authenticated;
revoke execute on function public.shift_no_shows_due from public, anon, authenticated;
grant execute on function public.shift_reminders_due to service_role;
grant execute on function public.shift_no_shows_due to service_role;
