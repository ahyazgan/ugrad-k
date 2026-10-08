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
- Ek km: 30 TL/km (Distance Matrix sürüş mesafesi, yukarı yuvarla)
- Acil (60 dk): +%50
- Gece 22:00–07:00 ve resmi tatil: +%50
- Bekleme: ilk 15 dk ücretsiz, sonra her 10 dk 50 TL
- Gidiş-dönüş: dönüş ayağı %50 indirimli
- 10 kg üzeri / büyük paket: +150 TL
- Avrupa yakasına geçiş: köprü ücreti eklenir
- Kurumsal: ayda 20+ teslimat %15, 50+ teslimat %25 indirim, ay sonu tek fatura
- Tüm fiyat parametreleri panelden değiştirilebilir olmalı (veritabanında `pricing_settings`)

### Netleşen kurallar (2026-10-08, kullanıcı kararı)
- Acil ve gece/tatil ek ücretleri **toplanır** (+%50 + %50 = +%100); gece ile tatil aynı anda olursa tek kez uygulanır
- Kurumsal indirim **ay sonu faturanın** KDV hariç toplamına uygulanır; kademe o ayın teslimat sayısıyla belirlenir
- Bekleme: 15 dk'dan sonra **başlayan** her 10 dk ücretlenir (yukarı yuvarlama)
- Gidiş-dönüş: dönüş ayağı **ek ücretler dahil** fiyatın %50'si; köprü ücreti indirimsiz
- Köprü: alış veya teslimden biri Avrupa yakasındaysa 1 geçiş (15 Temmuz/FSM motosiklet 25 TL, yalnız Anadolu→Avrupa yönü ücretli)
- Arife günleri 13:00'ten itibaren tatil sayılır; tatil listesi `holidays` tablosunda
- Tutarlar kuruş (tam sayı) tutulur; fiyat her zaman sunucuda yeniden hesaplanır

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
- `packages/shared/` — pricing.ts (tek fiyat kaynağı), orders.ts (durumlar), geo.ts (yaka/köprü), maps.ts (Google Places New + Routes API, mock), quote.ts (istek doğrulama + teklif), db.ts (satır ↔ tip)
- `supabase/migrations/` — şema, RLS, RPC, storage, sabit veriler; `supabase/functions/` — Edge Functions (Deno, `packages/shared`'ı doğrudan import eder; deploy `--use-api`)
- `apps/mobile/` — Expo SDK 57 + expo-router (`src/app/`). Supabase env yoksa **DEMO modu** (sahte veri, kod 123456). `pnpm --filter @yazgan/mobile e2e:web` tarayıcıda tam akışı test eder
- `apps/admin/` — Next.js 16 + Tailwind 4 panel. Supabase env yoksa **DEMO modu** (admin@yazgankurye.com / demo1234). Kurye hesabı oluşturma `/api/kuryeler` (service role yalnız sunucuda). `pnpm --filter @yazgan/admin e2e:web`
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
- [ ] Faz 8: App Store / Google Play yayını
