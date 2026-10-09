-- Kurye performansı: son N günün sayıları (puan packages/shared/performance.ts'de hesaplanır).
--  • Teklif: kabul / ret / süre doldu
--  • Teslim: teslim sayısı, acil teslim ve zamanında olanı, müşteri puanı
--  • Kabul ettiği işi bırakma (teklif reddi ve mola geri alması hariç), teslim edilemeyen
--  • Vardiya planı: planlanan (bitmiş) dilim, gelinen (en az yarısı çalışılan), geç iptal
-- Yönetici tüm kuryeleri, kurye yalnız kendini görür; servis rolü (auto-dispatch) hepsini.

create or replace function public.courier_performance_stats(p_days integer default 30, p_courier_id uuid default null)
returns table (
  courier_id uuid,
  offers_accepted integer,
  offers_declined integer,
  offers_timed_out integer,
  delivered integer,
  urgent_delivered integer,
  urgent_on_time integer,
  rating_count integer,
  rating_avg numeric,
  released integer,
  failed_deliveries integer,
  shifts_booked integer,
  shifts_attended integer,
  late_cancels integer
)
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(days => greatest(1, least(p_days, 180))) as t)
  select c.id,
    (select count(*)::integer from public.courier_offers o, since where o.courier_id = c.id and o.response = 'kabul' and o.offered_at > since.t),
    (select count(*)::integer from public.courier_offers o, since where o.courier_id = c.id and o.response = 'ret' and o.offered_at > since.t),
    (select count(*)::integer from public.courier_offers o, since where o.courier_id = c.id and o.response = 'zaman_asimi' and o.offered_at > since.t),
    (select count(*)::integer from public.orders o, since where o.courier_id = c.id and o.status = 'teslim_edildi' and o.delivered_at > since.t),
    (select count(*)::integer from public.orders o, since
      where o.courier_id = c.id and o.status = 'teslim_edildi' and o.delivered_at > since.t and o.sla_due_at is not null),
    (select count(*)::integer from public.orders o, since
      where o.courier_id = c.id and o.status = 'teslim_edildi' and o.delivered_at > since.t and o.sla_due_at is not null and o.sla_missed is false),
    (select count(*)::integer from public.order_ratings r join public.orders o on o.id = r.order_id, since
      where o.courier_id = c.id and r.created_at > since.t),
    (select round(avg(r.score), 2) from public.order_ratings r join public.orders o on o.id = r.order_id, since
      where o.courier_id = c.id and r.created_at > since.t),
    (select count(*)::integer from public.order_status_history h, since
      where h.changed_by = c.id and h.from_status = 'kuryeye_atandi' and h.to_status = 'onaylandi' and h.created_at > since.t
        and coalesce(h.note, '') not like 'Teklif%' and coalesce(h.note, '') not like 'Kurye molada%'),
    (select count(*)::integer from public.orders o, since where o.courier_id = c.id and o.failed_at > since.t),
    (select count(*)::integer from public.shift_bookings b, since
      where b.courier_id = c.id and b.cancelled_at is null and b.ends_at > since.t and b.ends_at <= now()),
    (select count(*)::integer from public.shift_bookings b, since
      where b.courier_id = c.id and b.cancelled_at is null and b.ends_at > since.t and b.ends_at <= now()
        and (select coalesce(sum(extract(epoch from least(coalesce(s.ended_at, now()), b.ends_at) - greatest(s.started_at, b.starts_at))), 0)
               from public.courier_shifts s
              where s.courier_id = b.courier_id and s.started_at < b.ends_at and coalesce(s.ended_at, now()) > b.starts_at)
            >= extract(epoch from b.ends_at - b.starts_at) / 2),
    (select count(*)::integer from public.shift_bookings b, since where b.courier_id = c.id and b.late_cancel and b.cancelled_at > since.t)
  from public.couriers c
  where (p_courier_id is null or c.id = p_courier_id)
    -- Yönetici hepsini, kurye kendini; JWT'siz çağrı yalnız servis rolüdür (anon'a kapalı)
    and (public.is_admin() or c.id = auth.uid() or auth.uid() is null);
$$;
revoke execute on function public.courier_performance_stats from public, anon;
grant execute on function public.courier_performance_stats to authenticated, service_role;
