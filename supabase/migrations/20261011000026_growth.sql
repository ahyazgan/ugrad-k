-- Müşteri büyütme: kampanya kodları, davet (referans) ödülü, geri kazanma mesajı.
--  • promo_codes / promo_redemptions: sunucu doğrular (packages/shared/promo.ts); fiyat satırı "promo"
--  • profiles.referral_code: müşterinin davet kodu; yeni müşteri ilk siparişinde kullanırsa indirim alır,
--    davet eden yeni müşterinin ilk teslimatında customer_credits'e ödül kazanır
--  • Geri kazanma (winback Edge Function, günlük): ticari ileti onayı olan, bir süredir sipariş vermeyen
--    müşteriye kişiye özel kampanya kodu. Varsayılan KAPALI (İYS kaydı gerekir).

create table public.promo_codes (
  code text primary key check (code = upper(code) and length(code) between 3 and 40),
  description text,
  kind text not null check (kind in ('yuzde', 'tutar')),
  value numeric(12, 2) not null check (value > 0),
  max_discount_kurus integer check (max_discount_kurus is null or max_discount_kurus > 0),
  min_subtotal_kurus integer not null default 0 check (min_subtotal_kurus >= 0),
  valid_from timestamptz,
  valid_until timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  new_customers_only boolean not null default false,
  customer_id uuid references public.profiles (id) on delete cascade,
  active boolean not null default true,
  source text not null default 'panel' check (source in ('panel', 'geri_kazanma')),
  created_at timestamptz not null default now(),
  check (kind <> 'yuzde' or value <= 100)
);
alter table public.promo_codes enable row level security;
create policy promo_codes_admin on public.promo_codes for all using (public.is_admin()) with check (public.is_admin());

create table public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  kind text not null check (kind in ('kampanya', 'davet')),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  amount_kurus integer not null check (amount_kurus >= 0),
  created_at timestamptz not null default now()
);
create index promo_redemptions_code_idx on public.promo_redemptions (code);
create index promo_redemptions_customer_idx on public.promo_redemptions (customer_id, code);
alter table public.promo_redemptions enable row level security;
create policy promo_redemptions_read on public.promo_redemptions for select using (public.is_admin() or customer_id = auth.uid());

-- Siparişten kod çıkarsa kullanım sayılmaz
create or replace function public.release_promo_on_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'iptal' and old.status is distinct from 'iptal' then
    delete from public.promo_redemptions where order_id = new.id;
  end if;
  return new;
end $$;
create trigger orders_release_promo after update of status on public.orders
  for each row execute function public.release_promo_on_cancel();

alter table public.orders add column promo_code text;

alter table public.profiles
  add column referral_code text unique check (referral_code is null or referral_code ~ '^[A-Z0-9]{6,12}$'),
  add column referred_by uuid references public.profiles (id) on delete set null,
  add column last_winback_at timestamptz;

alter table public.ops_settings
  add column referral_reward_kurus integer not null default 10000 check (referral_reward_kurus >= 0),
  add column winback_enabled boolean not null default false,
  add column winback_after_days integer not null default 30 check (winback_after_days between 7 and 365),
  add column winback_discount_pct numeric(5, 2) not null default 15 check (winback_discount_pct between 1 and 50);

-- Müşterinin davet kodu (yoksa üretir). Karışan karakterler (0/O, 1/I) kullanılmaz.
create or replace function public.my_referral_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  c text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli' using errcode = '42501';
  end if;
  select referral_code into c from public.profiles where id = auth.uid();
  if c is not null then
    return c;
  end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      update public.profiles set referral_code = c where id = auth.uid() and referral_code is null;
      return (select referral_code from public.profiles where id = auth.uid());
    exception when unique_violation then
      -- çakışma: yeni kod dene
    end;
  end loop;
end $$;
revoke execute on function public.my_referral_code from public, anon;
grant execute on function public.my_referral_code to authenticated;

-- Aynı sipariş hem gecikme telafisi (müşteriye) hem davet ödülü (davet edene) doğurabilir
alter table public.customer_credits drop constraint customer_credits_source_order_id_key;
alter table public.customer_credits add constraint customer_credits_customer_source_key unique (customer_id, source_order_id);

create or replace function public.grant_sla_credit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  amount integer;
begin
  if new.status = 'teslim_edildi' and old.status is distinct from 'teslim_edildi' and new.sla_missed then
    select coalesce(sum((l ->> 'amountKurus')::integer), 0) into amount
      from jsonb_array_elements(coalesce(new.price_quote -> 'lines', '[]'::jsonb)) l
     where l ->> 'code' = 'urgent';
    if amount > 0 then
      insert into public.customer_credits (customer_id, source_order_id, amount_kurus, reason)
      values (new.customer_id, new.id, amount, new.order_no || ' acil teslim gecikmesi telafisi')
      on conflict (customer_id, source_order_id) do nothing;
    end if;
  end if;
  return new;
end $$;

-- Davet ödülü: davet edilen müşterinin ilk teslimatında davet edene kredi
create or replace function public.grant_referral_credit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ref uuid;
  reward integer;
  name text;
begin
  if new.status = 'teslim_edildi' and old.status is distinct from 'teslim_edildi' then
    select referred_by, split_part(coalesce(full_name, 'Davetliniz'), ' ', 1) into ref, name
      from public.profiles where id = new.customer_id;
    if ref is not null and not exists (
      select 1 from public.orders o where o.customer_id = new.customer_id and o.status = 'teslim_edildi' and o.id <> new.id
    ) then
      select referral_reward_kurus into reward from public.ops_settings where id = 1;
      if reward > 0 then
        insert into public.customer_credits (customer_id, source_order_id, amount_kurus, reason)
        values (ref, new.id, reward, 'Davet ödülü (' || name || ')')
        on conflict (customer_id, source_order_id) do nothing;
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger orders_grant_referral_credit after update of status on public.orders
  for each row execute function public.grant_referral_credit();

-- Geri kazanma adayları: ticari ileti onayı var, en az bir teslimat, son sipariş p_after_days'ten eski,
-- son geri kazanma mesajı 60 günden eski
create or replace function public.winback_candidates(p_after_days integer, p_limit integer default 100)
returns table (id uuid, full_name text, phone text, push_token text, last_order_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.phone, p.push_token, max(o.created_at) as last_order_at
    from public.profiles p
    join public.orders o on o.customer_id = p.id and o.status <> 'iptal'
   where p.role = 'musteri' and p.deleted_at is null and p.corporate_account_id is null
     and (p.last_winback_at is null or p.last_winback_at < now() - interval '60 days')
     and exists (select 1 from public.current_consents c
                  where c.profile_id = p.id and c.consent_type = 'ticari_ileti' and c.granted)
     and exists (select 1 from public.orders d where d.customer_id = p.id and d.status = 'teslim_edildi')
   group by p.id
  having max(o.created_at) < now() - make_interval(days => p_after_days)
   order by max(o.created_at)
   limit p_limit;
$$;
revoke execute on function public.winback_candidates from public, anon, authenticated;
grant execute on function public.winback_candidates to service_role;
