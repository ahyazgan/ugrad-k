-- Başlangıç fiyat ayarları (CLAUDE.md "Fiyat kuralları" ile aynı; panelden değiştirilebilir).
-- bridge_fee_kurus: docs/fiyat-arastirmasi.md'deki güncel köprü ücretine göre panelden güncelleyin.
insert into public.pricing_settings (
  id, base_fee_kurus, included_km, per_km_kurus, urgent_surcharge_pct, night_holiday_surcharge_pct,
  night_start_hour, night_end_hour, half_day_start_hour, waiting_free_minutes, waiting_block_minutes,
  waiting_block_fee_kurus, return_leg_discount_pct, heavy_threshold_kg, heavy_surcharge_kurus,
  bridge_fee_kurus, corporate_tiers, vat_pct, utc_offset_minutes
) values (
  1, 35000, 3, 3000, 50, 50,
  22, 7, 13, 15, 10,
  5000, 50, 10, 15000,
  0, '[{"minDeliveries":20,"discountPct":15},{"minDeliveries":50,"discountPct":25}]', 20, 180
) on conflict (id) do nothing;
