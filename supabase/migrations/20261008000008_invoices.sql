-- Faturalar (e-arşiv / e-fatura). Bireysel siparişte teslimde otomatik kuyruğa girer;
-- kurumsal hesaplarda ay sonu tek fatura panelden oluşturulur (invoice-monthly).
-- invoice-dispatch Edge Function'ı bekleyenleri entegratöre (Paraşüt) gönderir.

create type public.invoice_status as enum ('pending', 'processing', 'issued', 'failed');
create type public.invoice_kind as enum ('order', 'monthly');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  kind public.invoice_kind not null,
  order_id uuid unique references public.orders (id) on delete restrict,
  corporate_account_id uuid references public.corporate_accounts (id),
  period text check (period ~ '^\d{4}-\d{2}$'),
  status public.invoice_status not null default 'pending',
  attempts smallint not null default 0,
  last_error text,
  -- Fatura anındaki alıcı bilgisi ve kalemler (sonradan değişikliklerden etkilenmez)
  buyer jsonb not null,
  description text not null,
  subtotal_kurus integer not null check (subtotal_kurus >= 0),
  vat_pct numeric(5, 2) not null,
  vat_kurus integer not null check (vat_kurus >= 0),
  total_kurus integer not null check (total_kurus >= 0),
  provider text not null default 'parasut',
  provider_invoice_id text,
  provider_doc_type text check (provider_doc_type in ('e_arsiv', 'e_fatura')),
  provider_doc_id text,
  pdf_url text,
  issued_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'order' and order_id is not null) or (kind = 'monthly' and corporate_account_id is not null and period is not null))
);
create unique index invoices_monthly_unique on public.invoices (corporate_account_id, period) where kind = 'monthly';
create index invoices_pending_idx on public.invoices (created_at) where status in ('pending', 'processing');

alter table public.invoices enable row level security;
create policy invoices_admin_all on public.invoices for all using (public.is_admin()) with check (public.is_admin());
create policy invoices_customer_read on public.invoices
  for select using (
    exists (select 1 from public.orders o where o.id = invoices.order_id and o.customer_id = auth.uid())
    or corporate_account_id = (select corporate_account_id from public.profiles where id = auth.uid())
  );

-- Bireysel teslimatlar için fatura kuyruğu. Kurumsal (cari) siparişler aylık faturaya girer.
create or replace function public.enqueue_order_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
begin
  if new.status = 'teslim_edildi' and old.status is distinct from 'teslim_edildi'
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
      'Kurye hizmeti ' || new.order_no,
      new.subtotal_kurus,
      case when new.subtotal_kurus > 0 then round(new.vat_kurus * 100.0 / new.subtotal_kurus) else 20 end,
      new.vat_kurus,
      new.total_kurus
    )
    on conflict (order_id) do nothing;
  end if;
  return new;
end $$;

create trigger orders_enqueue_invoice after update of status on public.orders
  for each row execute function public.enqueue_order_invoice();

create or replace function public.claim_invoices(p_limit integer default 10)
returns setof public.invoices
language sql security definer set search_path = public as $$
  update public.invoices i
     set status = 'processing', locked_at = now(), attempts = i.attempts + 1
   where i.id in (
     select id from public.invoices
      where attempts < 5
        and (status = 'pending' or (status = 'processing' and locked_at < now() - interval '15 minutes'))
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning i.*;
$$;

revoke execute on function public.claim_invoices from public, anon, authenticated;
grant execute on function public.claim_invoices to service_role;
