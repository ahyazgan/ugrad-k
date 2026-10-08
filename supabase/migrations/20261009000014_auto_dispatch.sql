-- Otomatik onay ve kurye atama (auto-dispatch Edge Function'ı tarafından çağrılır)

alter table public.orders add column unassigned_alerted_at timestamptz;

-- Ödenebilir (kart değil veya kartla ödenmiş) beklemedeki siparişleri onaylar
create or replace function public.auto_approve_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not (select auto_approve from public.ops_settings where id = 1) then return 0; end if;
  perform set_config('app.status_note', 'Otomatik onay', true);
  with u as (
    update public.orders set status = 'onaylandi'
     where status = 'beklemede'
       and (payment_method <> 'kart' or payment_status = 'odendi')
    returning 1
  )
  select count(*) into n from u;
  return n;
end $$;

-- Sistem ataması: sipariş hâlâ onaylı ve ödenebilir, kurye aktif ve vardiyadaysa atar
create or replace function public.system_assign_courier(p_order_id uuid, p_courier_id uuid, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (select 1 from public.couriers where id = p_courier_id and active and is_on_shift) then
    return false;
  end if;
  perform set_config('app.status_note', coalesce(p_note, 'Otomatik atama'), true);
  update public.orders
     set courier_id = p_courier_id, status = 'kuryeye_atandi'
   where id = p_order_id
     and status = 'onaylandi'
     and (payment_method <> 'kart' or payment_status = 'odendi');
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke execute on function public.auto_approve_orders from public, anon, authenticated;
revoke execute on function public.system_assign_courier from public, anon, authenticated;
grant execute on function public.auto_approve_orders to service_role;
grant execute on function public.system_assign_courier to service_role;
