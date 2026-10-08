-- Tanıtım sitesi: anonim fiyat hesaplama için hız sınırı ve kurumsal başvurular (lead).

-- ───────── Hız sınırı (site-api, kurumsal API). Sabit pencere sayacı.
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);
alter table public.rate_limits enable row level security; -- yalnız service_role

-- true: izin verildi, false: sınır aşıldı
create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_limit;
end $$;
revoke execute on function public.hit_rate_limit from public, anon, authenticated;
grant execute on function public.hit_rate_limit to service_role;

-- Eski sayaçları temizle (zamanlanmış görev çağırır)
create or replace function public.purge_rate_limits()
returns integer language sql security definer set search_path = public as $$
  with d as (delete from public.rate_limits where window_start < now() - interval '1 day' returning 1)
  select count(*)::integer from d;
$$;
revoke execute on function public.purge_rate_limits from public, anon, authenticated;
grant execute on function public.purge_rate_limits to service_role;

-- ───────── Başvurular (web sitesindeki kurumsal hesap / iletişim formları)
create type public.lead_status as enum ('yeni', 'arandi', 'kazanildi', 'kaybedildi');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('kurumsal', 'iletisim')),
  company_name text,
  contact_name text not null,
  phone text not null,
  email text,
  district text,
  monthly_volume text,
  message text,
  source_page text,
  kvkk_consent_at timestamptz not null,
  status public.lead_status not null default 'yeni',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_created_idx on public.leads (created_at desc);

alter table public.leads enable row level security;
create policy leads_admin_all on public.leads for all using (public.is_admin()) with check (public.is_admin());

create trigger leads_touch before update on public.leads
  for each row execute function public.set_updated_at();
