-- Uygulama içi mesajlaşma: kurye ↔ müşteri (ve yönetici) sipariş üzerinden yazışır; telefon numarası
-- paylaşmak gerekmez.
--  • order_messages: siparişe bağlı mesajlar (Realtime); okunma: alıcı taraf okuyunca read_at
--  • send_order_message(): yalnız siparişin müşterisi, kuryesi (kabul etmiş) veya yönetici; iş sürerken ve
--    tamamlandıktan sonra 2 saat; kişi başı saatte en fazla 30 mesaj
--  • Yeni mesaj karşı tarafa push bildirimi (notifications.kind mesaj_musteri / mesaj_kurye; SMS yok)
--  • Saklama: tamamlanan/iptal siparişlerin mesajları 90 gün sonra silinir (purge_old_messages, auto-dispatch)

create table public.order_messages (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  sender_role text not null check (sender_role in ('musteri', 'kurye', 'admin')),
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index order_messages_order_idx on public.order_messages (order_id, created_at);
alter table public.order_messages enable row level security;
alter publication supabase_realtime add table public.order_messages;

-- Okuma: yönetici; siparişin müşterisi; siparişin (şimdiki) kuryesi
create policy order_messages_read on public.order_messages for select using (
  public.is_admin() or exists (
    select 1 from public.orders o
     where o.id = order_messages.order_id
       and (o.customer_id = auth.uid() or o.courier_id = auth.uid())
  )
);

-- Yazışma açık mı: kurye işi kabul etmiş, iş sürüyor ya da 2 saattir tamamlanmış
create or replace function public.order_chat_open(o public.orders)
returns boolean language sql stable as $$
  select o.courier_id is not null
     and (o.offer_expires_at is null or o.offer_accepted_at is not null)
     and (o.status in ('kuryeye_atandi', 'alindi', 'yolda', 'sorunlu', 'geri_donuyor')
          or (o.status in ('teslim_edildi', 'geri_teslim') and coalesce(o.completed_at, now()) > now() - interval '2 hours'));
$$;

create or replace function public.send_order_message(p_order_id uuid, p_body text)
returns public.order_messages
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  m public.order_messages;
  role text;
  uid uuid := auth.uid();
begin
  select * into o from public.orders where id = p_order_id;
  if not found then
    raise exception 'Sipariş bulunamadı' using errcode = 'P0002';
  end if;
  role := case
    when public.is_admin() then 'admin'
    when o.customer_id = uid then 'musteri'
    when o.courier_id = uid and public.current_role_is('kurye') then 'kurye'
  end;
  if role is null then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  if role <> 'admin' and not public.order_chat_open(o) then
    raise exception 'Bu sipariş için yazışma kapalı' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_body, '')), '') is null or length(trim(p_body)) > 1000 then
    raise exception 'Mesaj 1–1000 karakter olmalı' using errcode = '22023';
  end if;
  if role <> 'admin' and (select count(*) from public.order_messages
       where order_id = p_order_id and sender_id = uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Çok fazla mesaj; lütfen biraz bekleyin' using errcode = '22023';
  end if;
  insert into public.order_messages (order_id, sender_id, sender_role, body)
  values (p_order_id, uid, role, trim(p_body)) returning * into m;
  -- Karşı tarafa push (yönetici yazarsa ikisine de)
  if role in ('kurye', 'admin') then
    perform public.enqueue_order_event(p_order_id, 'mesaj_musteri');
  end if;
  if role in ('musteri', 'admin') then
    perform public.enqueue_order_event(p_order_id, 'mesaj_kurye');
  end if;
  return m;
end $$;
revoke execute on function public.send_order_message from public, anon;
grant execute on function public.send_order_message to authenticated;

-- Okundu: çağıranın tarafına gelen (başkasının yazdığı) mesajlar
create or replace function public.mark_messages_read(p_order_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  n integer;
  uid uuid := auth.uid();
begin
  select * into o from public.orders where id = p_order_id;
  if not found or not (o.customer_id = uid or o.courier_id = uid or public.is_admin()) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  update public.order_messages set read_at = now()
   where order_id = p_order_id and read_at is null and sender_id is distinct from uid
     -- Yönetici okuması müşteri/kurye adına okundu sayılmaz
     and (not public.is_admin() or o.customer_id = uid or o.courier_id = uid);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.mark_messages_read from public, anon;
grant execute on function public.mark_messages_read to authenticated;

create or replace function public.purge_old_messages()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.order_messages m
   using public.orders o
   where o.id = m.order_id
     and o.status in ('teslim_edildi', 'geri_teslim', 'iptal')
     and m.created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_old_messages from public, anon, authenticated;
grant execute on function public.purge_old_messages to service_role;
