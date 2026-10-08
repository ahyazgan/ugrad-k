# Yazgan Kurye — Proje Rehberi

Bu dosya Claude Code için proje hafızasıdır. Her oturumda önce bunu oku.

## Şirket
- Unvan: YAZGAN TEKNOLOJİ LOJİSTİK TİCARET VE SANAYİ LTD. ŞTİ.
- Merkez: Kılıçlı Mah. Şile Cad. No: 8A, Beykoz / İstanbul
- İş: Moto kurye (B2B acil evrak/paket ağırlıklı), Anadolu yakası öncelikli
- İşletmeci tek kişi; tüm operasyon yapay zeka ve otomasyonla yürütülecek

## Ürün: 3 parça
1. **Müşteri uygulaması** (mobil): adres gir → fiyat gör → onayla → öde → kuryeyi canlı takip et
2. **Kurye uygulaması** (mobil): işi kabul et → alış → teslim (fotoğraf + imza) → konum paylaşımı
3. **Yönetim paneli** (web): siparişler, kuryeler, fiyatlar, raporlar, müşteriler

## Teknoloji yığını
- Mobil: **Expo (React Native) + TypeScript** — müşteri ve kurye uygulaması tek kod tabanında, rol bazlı ekranlar
- Panel: **Next.js + TypeScript + Tailwind**
- Backend: **Supabase** (Postgres, Auth, Realtime konum, Storage teslim fotoğrafları, Edge Functions)
- Harita/mesafe: **Google Maps Platform** (Places Autocomplete, Distance Matrix)
- Ödeme: **iyzico** (sonra PayTR alternatifi)
- Bildirim: Expo Push + SMS (Netgsm) + WhatsApp Business API
- Fatura: e-arşiv/e-fatura entegratörü API (Paraşüt vb.) — teslimattan sonra otomatik
- Monorepo: `apps/mobile`, `apps/admin`, `packages/shared` (tipler, fiyat hesabı)

## Fiyat kuralları (KDV hariç) — tek kaynak: `packages/shared/pricing.ts`
- Açılış: 350 TL (ilk 3 km dahil)
- Ek km (kademeli, 2026-10-09'dan itibaren): 3–10 km arası 25 TL/km, 10 km üstü 18 TL/km (sürüş mesafesi, yukarı yuvarla). İlk tarife sabit 30 TL/km idi; panelden geri yüklenebilir
- Hizmet seviyesi (v2, 2026-10-08): **ekonomi** (gün içi, −%25, yalnız Pzt–Cmt 07:00–14:00 alış) / **standart** / **acil** (60 dk, +%50). `orders.service_level`; `urgent` geriye uyumluluk için tutulur (acil ⇔ urgent, tetikleyiciyle eşlenir)
- Gece 22:00–07:00 +%50, **Pazar +%50**, resmi tatil +%50 — ayrı parametreler, toplanmaz, en yükseği uygulanır
- Uzak alış: merkeze (Beykoz) tahmini yol mesafesi 40 km'yi aşan her km 10 TL, en fazla 300 TL
- Motosiklet sınırı 20 kg; üstü reddedilir
- Bekleme: ilk 15 dk ücretsiz, sonra her 10 dk 50 TL
- Gidiş-dönüş: dönüş ayağı %50 indirimli
- 10 kg üzeri / büyük paket: +150 TL
- Avrupa yakasına geçiş: köprü ücreti eklenir
- Kurumsal: ayda 20+ teslimat %15, 50+ teslimat %25 indirim, ay sonu tek fatura
- Tüm fiyat parametreleri panelden değiştirilebilir olmalı (veritabanında `pricing_settings`)

### Netleşen kurallar (2026-10-08, kullanıcı kararı)
- Acil ve gece/tatil ek ücretleri **toplanır**, ancak toplam **en fazla +%75** (2026-10-09; tavanı aşan kısım gece/tatil payından düşülür); gece ile tatil aynı anda olursa tek kez uygulanır
- Kurumsal indirim **ay sonu faturada** yalnız taşıma bedeline (açılış, km, hizmet seviyesi, zaman eki, dönüş ayağı; `DISCOUNTABLE_LINE_CODES`) uygulanır; köprü, bekleme, ağır paket ve uzak alış indirimsiz (v2). Kademe o ayın teslimat sayısıyla belirlenir
- Bekleme: 15 dk'dan sonra **başlayan** her 10 dk ücretlenir (yukarı yuvarlama)
- Gidiş-dönüş: dönüş ayağı **ek ücretler dahil** fiyatın %50'si; köprü ücreti indirimsiz
- Köprü: alış veya teslimden biri Avrupa yakasındaysa 1 geçiş (15 Temmuz/FSM motosiklet 25 TL, yalnız Anadolu→Avrupa yönü ücretli)
- Arife günleri 13:00'ten itibaren tatil sayılır; tatil listesi `holidays` tablosunda
- Tutarlar kuruş (tam sayı) tutulur; fiyat her zaman sunucuda yeniden hesaplanır
- Dinamik yoğunluk zammı ve dakika ücreti yok (B2B öngörülebilirlik). Enflasyon: panel → Fiyatlar → endeks aracı (üç ayda bir TÜFE; köprü hariç). Maliyet/marj tahmini `packages/shared/cost.ts`. Gerekçeler: `docs/fiyat-arastirmasi.md` §8

## Sipariş durumları
`beklemede → onaylandi → kuryeye_atandi → alindi → yolda → teslim_edildi`
Ek: `iptal`, `sorunlu`

## Kurallar (Claude Code için)
- Arayüz dili **Türkçe**, kod ve değişken adları İngilizce
- Her özellik küçük adımlarla yapılır; her adımdan sonra çalıştırılıp test edilir
- Gizli anahtarlar `.env` içinde; asla koda yazılmaz, git'e gönderilmez
- KVKK: konum/adres/telefon verisi için aydınlatma metni ve açık rıza ekranı zorunlu
- Kurye çalışma saatleri kaydedilir (BTK bildirimi için rapor alınabilmeli)
- Fiyat hesabı tek fonksiyonda; mobil, panel ve yapay zeka asistanı aynı fonksiyonu kullanır
- Değişiklik yapmadan önce planı kısaca anlat, onay al
  - **İstisna (2026-10-08):** Kullanıcı tüm fazları otomatik yürütme izni verdi. Claude fazları sırayla kendisi
    tamamlar, sorun çıkarsa çözer ve devam eder. API anahtarı / hesap gerektiren adımlar sahte (mock) sağlayıcıyla
    yapılır ve `docs/kurulum.md` içinde kullanıcıya bırakılır.

## Kod yapısı ve komutlar
- **Marka/alan adı tek kaynak: `packages/shared/brand.ts`** (kullanıcı yeni marka adı alacak; kodda marka adı veya alan adı sabit yazılmaz, `BRAND`/`trackingBaseUrl`/`kvkkUrl` kullanılır)
- `apps/web/` — Next.js tanıtım sitesi: fiyat hesaplayıcı, ilçe SEO sayfaları (`lib/districts.ts`, Türkçe ekler `lib/tr.ts`), kurumsal başvuru, kurye başvurusu (belge yükleme), API belgeleri, sitemap/robots/JSON-LD. Supabase env yoksa demo. `/api/v1/*` → Edge Function `api` (rewrite). `pnpm --filter @yazgan/web e2e:web`
- `packages/shared/` — tiles.ts (harita karo hesabı; mobil `TileMap` yerel modülsüz OSM haritası), pricing.ts (tek fiyat kaynağı), cost.ts (maliyet/marj, endeks), orders.ts (durumlar), geo.ts (yaka/köprü), maps.ts (Google Places New + Routes API, mock), quote.ts (istek doğrulama + teklif), db.ts (satır ↔ tip)
- `supabase/migrations/` — şema, RLS, RPC, storage, sabit veriler; `supabase/functions/` — Edge Functions (Deno, `packages/shared`'ı doğrudan import eder; deploy `--use-api`)
- `apps/mobile/` — Expo SDK 57 + expo-router (`src/app/`). Supabase env yoksa **DEMO modu** (sahte veri, kod 123456). `pnpm --filter @yazgan/mobile e2e:web` tarayıcıda tam akışı test eder
- `apps/admin/` — Next.js 16 + Tailwind 4 panel. Supabase env yoksa **DEMO modu** (admin@yazgankurye.com / demo1234). Kurye hesabı oluşturma `/api/kuryeler` (service role yalnız sunucuda). `pnpm --filter @yazgan/admin e2e:web`
- Herkese açık Edge Functions: `site-api` (fiyat/adres/başvuru/kurye başvurusu/değerlendirme; IP hız sınırı `hit_rate_limit`), `api` (kurumsal REST, `yk_live_` anahtar SHA-256), `email-inbound` (Postmark → asistan, SPF/DKIM + kayıtlı müşteri), `health` (GET ayrıntısız; cron uyarı), `webhook-dispatch` (HMAC imzalı kurumsal webhook kuyruğu)
- Edge Functions: auto-dispatch (otomatik onay + kurye atama, `packages/shared/assignment.ts`), admin-order (telefon siparişi), quote, create-order, places, send-sms, reprice-order, notify-dispatch, payment-init/callback/refund, invoice-dispatch/monthly, whatsapp-webhook, assistant-voice, account-delete
- Kurye hakedişi: `cost_settings` (ödeme modeli = maliyet modeli, `packages/shared/cost.ts` `courierEarning`), `courier_earnings` (Edge Function `courier-earnings`, 5 dk cron), `courier_payouts` (RPC `create_courier_payout`/`cancel_courier_payout`). Kuryeye ödemeli siparişte teslimde `cash_collection` (nakit/iban/alinmadi) zorunlu; nakit hakedişten düşülür. Panel `/hakedis`, kurye uygulaması Kazancım sekmesi. docs/kurulum.md §23
- Kurye belgeleri: `courier_document_types` (= `packages/shared/compliance.ts` `COURIER_DOCUMENT_TYPES`, schema-sync testi), `courier_documents`, bucket `courier-docs`. `ops_settings.enforce_courier_documents` açıkken zorunlu belgesi eksik/süresi dolmuş kurye `start_shift` ile vardiyaya giremez, auto-dispatch iş vermez; süresi dolan/yaklaşan belgeler `system_health` uyarısı. docs/kurulum.md §24
- Operasyon ayarları `ops_settings` (panel → Otomasyon): otomatik onay/atama, kapasite, mesafe, ödeme süresi
- Kuyruklar (outbox): `notifications` ve `invoices` tabloları; dakikalık cron ile işlenir (docs/kurulum.md §6)
- Yapay zeka asistanı: `supabase/functions/_shared/assistant.ts` (Claude, araçlar aynı sipariş API'sini kullanır; geçmiş yalnızca sona eklenir)
- Panel: Raporlar (`/raporlar`, `lib/reports.ts`, CSV `;` + ondalık virgül), Canlı harita (`/harita`, Leaflet + OSM; karo URL'si env ile değişir). E2E'de harita karoları `scripts/e2e-tile-stub.cjs` ile sahte PNG'den gelir
- Kurulum ve canlıya alma: `docs/kurulum.md`; mağaza: `docs/magaza.md`
- `pnpm test` (vitest), `pnpm test:functions` (Deno), `pnpm test:db` (yerel Postgres'te migration + RLS), `pnpm test:all`
- Google'ın eski Distance Matrix/Places API'leri yeni projelerde açılamıyor → **Routes API** ve **Places API (New)** kullanılıyor

## Yol haritası
- [x] Faz 1: Monorepo kurulumu, Supabase şeması, fiyat fonksiyonu + testleri
- [x] Faz 2: Müşteri akışı (adres → fiyat → sipariş) — ödeme olmadan
- [x] Faz 3: Yönetim paneli (sipariş listesi, kurye atama)
- [x] Faz 4: Kurye uygulaması (iş kabul, konum, teslim fotoğrafı)
- [x] Faz 5: Canlı takip linki + SMS/WhatsApp bildirimleri
- [x] Faz 6: iyzico ödeme + otomatik e-arşiv fatura
- [x] Faz 7: Yapay zeka sesli asistan ve WhatsApp botu → aynı sipariş API'sine bağlanır
- [~] Faz 8: App Store / Google Play yayını — kod hazır (EAS, hesap silme, yasal sayfalar, `docs/magaza.md`); mağaza hesapları ve gönderim kullanıcıda
- [x] Dış kanallar (2026-10-10): marka tek dosyada, web sitesi + SEO, tarayıcıdan sipariş (Expo web, ödeme dönüşü), kurumsal başvuru ve kurye başvurusu (panel → Başvurular), e-postayla sipariş, kurumsal API + webhook, teslim sonrası puan + Google yorum, sistem izleme (panel → Otomasyon → Sistem durumu). Kurulum: docs/kurulum.md §16–22
- [x] Fiyat algoritması v2 (2026-10-08): hizmet seviyeleri (ekonomi/standart/acil), Pazar eki, uzak alış, 20 kg sınırı, kurumsal indirim kapsamı, endeks aracı, maliyet/marj simülasyonu (`docs/fiyat-arastirmasi.md` §8)
- [x] Kurye hakedişi ve nakit mutabakatı (2026-10-08)
- [x] Kurye belge ve uyum takibi (2026-10-08)
- [ ] ETA ve 60 dk acil taahhüdü takibi
- [x] Ek geliştirmeler (2026-10-09): panelden telefon siparişi, otomatik onay + kurye atama, ödenmemiş kart siparişi iptali, kademeli km + %75 ek ücret tavanı (panelden tek tıkla eski tarifeye dönüş), raporlar + CSV, canlı haritalar (panel, takip sayfası, müşteri ve kurye uygulaması)
