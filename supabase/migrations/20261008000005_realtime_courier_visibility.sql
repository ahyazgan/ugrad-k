-- Müşteri, aktif teslimat sırasında kendisine atanan kuryenin kaydını (plaka) görebilir.
create policy couriers_assigned_read on public.couriers
  for select using (
    exists (
      select 1 from public.orders o
      where o.courier_id = couriers.id
        and o.customer_id = auth.uid()
        and public.is_active_delivery_status(o.status)
    )
  );

-- Canlı güncellemeler (Supabase Realtime): sipariş durumu ve kurye konumu.
-- RLS geçerlidir; herkes yalnızca görebildiği satırların değişikliklerini alır.
alter publication supabase_realtime add table public.orders, public.courier_locations;
