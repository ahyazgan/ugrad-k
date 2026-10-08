-- Kurye başvuruları (web sitesi /kurye-ol). Belgeler özel "basvuru" bucket'ında: <basvuru_id>/<tür>-<rastgele>.<uzantı>
-- KVKK: adli sicil gibi özel nitelikli veriler formda istenmez; gerekirse görüşmede ayrıca açık rıza alınır.

create type public.application_status as enum ('yeni', 'gorusme', 'onaylandi', 'reddedildi');

create table public.courier_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  district text,
  birth_year smallint check (birth_year between 1940 and 2010),
  license_class text,
  has_motorcycle boolean not null default false,
  plate text,
  vehicle_model text,
  experience_years smallint check (experience_years between 0 and 60),
  availability text check (availability in ('tam_zamanli', 'yari_zamanli', 'hafta_sonu')),
  message text,
  -- Yüklenecek belge yolları (site-api imzalı yükleme adresi üretir)
  documents jsonb not null default '[]'::jsonb,
  kvkk_consent_at timestamptz not null,
  status public.application_status not null default 'yeni',
  admin_note text,
  courier_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courier_applications_created_idx on public.courier_applications (created_at desc);
-- Aynı numaradan açık başvuru tekrarlanmasın
create unique index courier_applications_open_phone on public.courier_applications (phone) where status in ('yeni', 'gorusme');

alter table public.courier_applications enable row level security;
create policy courier_applications_admin_all on public.courier_applications
  for all using (public.is_admin()) with check (public.is_admin());

create trigger courier_applications_touch before update on public.courier_applications
  for each row execute function public.set_updated_at();

-- Belgeler: özel bucket, yalnız resim/PDF, en fazla 5 MB. Yükleme imzalı adresle (service role üretir),
-- okuma yalnızca yönetici.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('basvuru', 'basvuru', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy basvuru_admin_read on storage.objects
  for select to authenticated using (bucket_id = 'basvuru' and public.is_admin());

-- Başvurular 1 yıl sonra (işe alınmayanlar) silinmek üzere listelenir — KVKK saklama süresi
create or replace function public.stale_courier_applications()
returns setof public.courier_applications
language sql stable security definer set search_path = public as $$
  select * from public.courier_applications
  where status in ('reddedildi', 'yeni', 'gorusme') and created_at < now() - interval '1 year';
$$;
revoke execute on function public.stale_courier_applications from public, anon, authenticated;
grant execute on function public.stale_courier_applications to service_role;
