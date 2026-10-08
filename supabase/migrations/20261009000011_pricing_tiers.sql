-- Kademeli ek km ücreti ve acil + gece/tatil toplam ek ücret tavanı.
-- Değerler fiyat araştırmasının önerisidir (docs/fiyat-arastirmasi.md §6.3); panelden değiştirilir.
-- Eski tarifeye dönmek için: km_tiers = '[]' (per_km_kurus kullanılır), max_surcharge_pct = null.
alter table public.pricing_settings
  add column km_tiers jsonb not null default '[]'::jsonb check (jsonb_typeof(km_tiers) = 'array'),
  add column max_surcharge_pct numeric(5, 2) check (max_surcharge_pct is null or max_surcharge_pct >= 0);

update public.pricing_settings
   set km_tiers = '[{"uptoKm":10,"perKmKurus":2500},{"uptoKm":null,"perKmKurus":1800}]'::jsonb,
       max_surcharge_pct = 75
 where id = 1;
