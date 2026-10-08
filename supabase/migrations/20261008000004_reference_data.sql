-- Canlı ortamda da gerekli sabit veriler: başlangıç fiyat ayarları ve resmi tatiller.
-- Fiyatlar CLAUDE.md "Fiyat kuralları" ile aynıdır; sonrasında panelden değiştirilir.
-- Köprü: 15 Temmuz / FSM motosiklet 25 TL, yalnız Anadolu→Avrupa yönü (docs/fiyat-arastirmasi.md).
insert into public.pricing_settings (
  id, base_fee_kurus, included_km, per_km_kurus, urgent_surcharge_pct, night_holiday_surcharge_pct,
  night_start_hour, night_end_hour, half_day_start_hour, waiting_free_minutes, waiting_block_minutes,
  waiting_block_fee_kurus, return_leg_discount_pct, heavy_threshold_kg, heavy_surcharge_kurus,
  bridge_fee_kurus, corporate_tiers, vat_pct, utc_offset_minutes
) values (
  1, 35000, 3, 3000, 50, 50,
  22, 7, 13, 15, 10,
  5000, 50, 10, 15000,
  2500, '[{"minDeliveries":20,"discountPct":15},{"minDeliveries":50,"discountPct":25}]', 20, 180
) on conflict (id) do nothing;

-- Kaynak: docs/resmi-tatiller.json (arife günleri 13:00'ten itibaren tatil sayılır)
insert into public.holidays (date, name, half_day) values
  ('2026-01-01', 'Yılbaşı', false),
  ('2026-03-19', 'Ramazan Bayramı Arifesi', true),
  ('2026-03-20', 'Ramazan Bayramı 1. Gün', false),
  ('2026-03-21', 'Ramazan Bayramı 2. Gün', false),
  ('2026-03-22', 'Ramazan Bayramı 3. Gün', false),
  ('2026-04-23', 'Ulusal Egemenlik ve Çocuk Bayramı', false),
  ('2026-05-01', 'Emek ve Dayanışma Günü', false),
  ('2026-05-19', 'Atatürk''ü Anma, Gençlik ve Spor Bayramı', false),
  ('2026-05-26', 'Kurban Bayramı Arifesi', true),
  ('2026-05-27', 'Kurban Bayramı 1. Gün', false),
  ('2026-05-28', 'Kurban Bayramı 2. Gün', false),
  ('2026-05-29', 'Kurban Bayramı 3. Gün', false),
  ('2026-05-30', 'Kurban Bayramı 4. Gün', false),
  ('2026-07-15', 'Demokrasi ve Milli Birlik Günü', false),
  ('2026-08-30', 'Zafer Bayramı', false),
  ('2026-10-28', 'Cumhuriyet Bayramı Arifesi', true),
  ('2026-10-29', 'Cumhuriyet Bayramı', false),
  ('2027-01-01', 'Yılbaşı', false),
  ('2027-03-08', 'Ramazan Bayramı Arifesi', true),
  ('2027-03-09', 'Ramazan Bayramı 1. Gün', false),
  ('2027-03-10', 'Ramazan Bayramı 2. Gün', false),
  ('2027-03-11', 'Ramazan Bayramı 3. Gün', false),
  ('2027-04-23', 'Ulusal Egemenlik ve Çocuk Bayramı', false),
  ('2027-05-01', 'Emek ve Dayanışma Günü', false),
  ('2027-05-15', 'Kurban Bayramı Arifesi', true),
  ('2027-05-16', 'Kurban Bayramı 1. Gün', false),
  ('2027-05-17', 'Kurban Bayramı 2. Gün', false),
  ('2027-05-18', 'Kurban Bayramı 3. Gün', false),
  ('2027-05-19', 'Kurban Bayramı 4. Gün / Atatürk''ü Anma, Gençlik ve Spor Bayramı', false),
  ('2027-07-15', 'Demokrasi ve Milli Birlik Günü', false),
  ('2027-08-30', 'Zafer Bayramı', false),
  ('2027-10-28', 'Cumhuriyet Bayramı Arifesi', true),
  ('2027-10-29', 'Cumhuriyet Bayramı', false)
on conflict (date) do nothing;
