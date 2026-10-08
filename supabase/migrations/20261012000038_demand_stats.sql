-- Talep yoğunluğu: geçmiş siparişler İstanbul hafta günü × saat × ~1 km alış hücresi
-- (packages/shared/demand.ts ile aynı formül). Ham koordinat dönmez, yalnız hücre merkezi.
--  • Yönetici tüm hücreleri görür (panel → Talep yoğunluğu: ısı tablosu, sıcak bölgeler, vardiya önerisi)
--  • Kurye yalnız en az 3 siparişli hücreleri görür (tek müşterinin adresi seçilemesin; KVKK)
--  • weeks: ortalamanın paydası; yeni işletmede ilk siparişten bu yana geçen hafta (en az 1)

create or replace function public.demand_stats(p_days integer default 56)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  is_adm boolean := public.is_admin();
  since timestamptz := now() - make_interval(days => greatest(7, least(coalesce(p_days, 56), 365)));
  min_orders integer;
  first_at timestamptz;
  result jsonb;
begin
  -- JWT'siz çağrı yalnız servis rolüdür (anon'a kapalı)
  if not (is_adm or public.current_role_is('kurye') or auth.uid() is null) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  min_orders := case when is_adm or auth.uid() is null then 1 else 3 end;

  select min(coalesce(o.scheduled_pickup_at, o.created_at)) into first_at
    from public.orders o
   where coalesce(o.scheduled_pickup_at, o.created_at) >= since and coalesce(o.scheduled_pickup_at, o.created_at) < now()
     and o.status <> 'iptal' and o.pickup_lat is not null and o.pickup_lng is not null;

  with base as (
    select coalesce(o.scheduled_pickup_at, o.created_at) at time zone 'Europe/Istanbul' as t,
           round((floor(o.pickup_lat::numeric / 0.01) + 0.5) * 0.01, 6) as lat,
           round((floor(o.pickup_lng::numeric / 0.013) + 0.5) * 0.013, 6) as lng,
           substring(o.pickup_address from '([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*/\s*İstanbul') as district
      from public.orders o
     where coalesce(o.scheduled_pickup_at, o.created_at) >= since and coalesce(o.scheduled_pickup_at, o.created_at) < now()
       and o.status <> 'iptal' and o.pickup_lat is not null and o.pickup_lng is not null
  ), cells as (
    select extract(isodow from t)::integer as weekday, extract(hour from t)::integer as hour, lat, lng,
           count(*)::integer as orders,
           mode() within group (order by district) as district
      from base
     group by 1, 2, 3, 4
    having count(*) >= min_orders
  )
  select coalesce(jsonb_agg(jsonb_build_object('weekday', weekday, 'hour', hour, 'lat', lat, 'lng', lng, 'orders', orders, 'district', district)
                            order by weekday, hour, lat, lng), '[]')
    into result
    from (select * from cells order by orders desc limit 5000) c;

  return jsonb_build_object(
    'weeks', case when first_at is null then 1
                  else greatest(1, round((extract(epoch from now() - greatest(first_at, since)) / 604800)::numeric, 1)) end,
    'rows', result
  );
end $$;
revoke execute on function public.demand_stats from public, anon;
grant execute on function public.demand_stats to authenticated, service_role;
