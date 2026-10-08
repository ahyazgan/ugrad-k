-- Kurye belge ve uyum takibi (packages/shared/compliance.ts ile aynı liste).
-- Zorunlu belgesi eksik veya süresi dolmuş kurye, enforce_courier_documents açıkken vardiyaya giremez;
-- otomatik atama da ona iş vermez. Süresi dolan/yaklaşan belgeler sistem denetiminde uyarı olur.

create table public.courier_document_types (
  kind text primary key,
  label text not null,
  required boolean not null,
  expires boolean not null,
  sort smallint not null
);
insert into public.courier_document_types (kind, label, required, expires, sort) values
  ('ehliyet', 'Sürücü belgesi (A1/A2/A)', true, true, 1),
  ('kurye_faaliyet_belgesi', 'Kurye faaliyet belgesi', true, true, 2),
  ('ruhsat', 'Motosiklet ruhsatı', true, false, 3),
  ('trafik_sigortasi', 'Zorunlu trafik sigortası', true, true, 4),
  ('src', 'SRC / mesleki yeterlilik (kurye)', false, true, 5),
  ('muayene', 'Araç muayenesi', false, true, 6),
  ('kasko', 'Kasko / ferdi kaza sigortası', false, true, 7),
  ('adli_sicil', 'Adli sicil kaydı', false, false, 8),
  ('vergi_levhasi', 'Vergi levhası / esnaf muafiyet belgesi', false, false, 9);
alter table public.courier_document_types enable row level security;
create policy courier_document_types_read on public.courier_document_types for select using (auth.uid() is not null);

create table public.courier_documents (
  courier_id uuid not null references public.couriers (id) on delete cascade,
  kind text not null references public.courier_document_types (kind),
  doc_number text,
  expires_at date,
  file_path text,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (courier_id, kind)
);
create index courier_documents_expiry_idx on public.courier_documents (expires_at) where expires_at is not null;
create trigger courier_documents_updated before update on public.courier_documents
  for each row execute function public.set_updated_at();
alter table public.courier_documents enable row level security;
create policy courier_documents_admin on public.courier_documents for all
  using (public.is_admin()) with check (public.is_admin());
create policy courier_documents_own_read on public.courier_documents for select using (courier_id = auth.uid());

-- Belge dosyaları: özel bucket, yol <courier_id>/<kind>-<zaman>.<uzantı>; yönetici yükler, kurye kendininkini görür
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('courier-docs', 'courier-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
create policy courier_docs_admin on storage.objects for all to authenticated
  using (bucket_id = 'courier-docs' and public.is_admin())
  with check (bucket_id = 'courier-docs' and public.is_admin());
create policy courier_docs_own_read on storage.objects for select to authenticated
  using (bucket_id = 'courier-docs' and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.ops_settings
  add column enforce_courier_documents boolean not null default true,
  add column document_warn_days integer not null default 30 check (document_warn_days between 1 and 180);

-- Kuryenin vardiyayı engelleyen belgeleri: zorunlu olup eksik veya süresi dolmuş (İstanbul günü; bitiş günü dahil geçerli)
create or replace function public.courier_document_problems(p_courier_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(
           t.label || case when d.kind is null then ' (eksik)' else ' (süresi dolmuş)' end
           order by t.sort), '{}')
    from public.courier_document_types t
    left join public.courier_documents d on d.kind = t.kind and d.courier_id = p_courier_id
   where t.required
     and (d.kind is null or (t.expires and d.expires_at is not null
                             and d.expires_at < (now() at time zone 'Europe/Istanbul')::date));
$$;
revoke execute on function public.courier_document_problems from public, anon;
grant execute on function public.courier_document_problems to authenticated, service_role;

create or replace function public.start_shift(p_lat double precision default null, p_lng double precision default null)
returns public.courier_shifts
language plpgsql security definer set search_path = public as $$
declare
  s public.courier_shifts;
  problems text[];
begin
  if not exists (select 1 from public.couriers where id = auth.uid() and active) then
    raise exception 'Aktif kurye kaydı bulunamadı' using errcode = '42501';
  end if;
  select * into s from public.courier_shifts where courier_id = auth.uid() and ended_at is null;
  if found then
    return s;
  end if;
  if (select enforce_courier_documents from public.ops_settings where id = 1) then
    problems := public.courier_document_problems(auth.uid());
    if cardinality(problems) > 0 then
      raise exception 'Belgeleriniz eksik veya süresi dolmuş: %. Yöneticinize iletin.', array_to_string(problems, ', ')
        using errcode = '22023';
    end if;
  end if;
  insert into public.courier_shifts (courier_id, start_lat, start_lng)
  values (auth.uid(), p_lat, p_lng) returning * into s;
  update public.couriers set is_on_shift = true where id = auth.uid();
  return s;
end $$;

-- Sağlık özeti: belgeler eklendi (aktif kuryelerde süresi dolan ve yaklaşan belge sayısı)
create or replace function public.system_health()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'checked_at', now(),
    'notifications_stuck', (select count(*) from public.notifications
       where status in ('pending', 'processing') and attempts < 5 and created_at < now() - interval '10 minutes'),
    'notifications_failed_24h', (select count(*) from public.notifications
       where status = 'failed' and created_at > now() - interval '24 hours'),
    'invoices_failed', (select count(*) from public.invoices where status = 'failed'),
    'invoices_stuck', (select count(*) from public.invoices
       where status in ('pending', 'processing') and created_at < now() - interval '1 hour'),
    'webhooks_failed_24h', (select count(*) from public.webhook_deliveries
       where status = 'failed' and created_at > now() - interval '24 hours'),
    'webhooks_stuck', (select count(*) from public.webhook_deliveries
       where status = 'pending' and next_attempt_at < now() - interval '30 minutes'),
    'orders_waiting', (select count(*) from public.orders
       where status in ('beklemede', 'onaylandi') and created_at < now() - interval '30 minutes'
         and coalesce(scheduled_pickup_at, created_at) < now()
         and not (payment_method = 'kart' and payment_status = 'odenmedi')),
    'orders_problem', (select count(*) from public.orders where status = 'sorunlu'),
    'couriers_on_shift', (select count(*) from public.couriers where is_on_shift and active),
    'couriers_stale', (select count(*) from public.couriers
       where is_on_shift and active and (last_location_at is null or last_location_at < now() - interval '15 minutes')),
    'courier_docs_expired', (select count(*) from public.courier_documents d
       join public.couriers c on c.id = d.courier_id and c.active
       where d.expires_at < (now() at time zone 'Europe/Istanbul')::date),
    'courier_docs_expiring', (select count(*) from public.courier_documents d
       join public.couriers c on c.id = d.courier_id and c.active
       where d.expires_at between (now() at time zone 'Europe/Istanbul')::date
         and (now() at time zone 'Europe/Istanbul')::date
             + (select document_warn_days from public.ops_settings where id = 1)),
    'heartbeats', coalesce((select jsonb_object_agg(name, last_run_at) from public.system_heartbeats), '{}'::jsonb)
  );
$$;
revoke execute on function public.system_health from public, anon, authenticated;
grant execute on function public.system_health to service_role;
