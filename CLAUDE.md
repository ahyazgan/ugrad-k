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

## Yol haritası
- [ ] Faz 1: Monorepo kurulumu, Supabase şeması, fiyat fonksiyonu + testleri
- [ ] Faz 2: Müşteri akışı (adres → fiyat → sipariş) — ödeme olmadan
- [ ] Faz 3: Yönetim paneli (sipariş listesi, kurye atama)
- [ ] Faz 4: Kurye uygulaması (iş kabul, konum, teslim fotoğrafı)
- [ ] Faz 5: Canlı takip linki + SMS/WhatsApp bildirimleri
- [ ] Faz 6: iyzico ödeme + otomatik e-arşiv fatura
- [ ] Faz 7: Yapay zeka sesli asistan ve WhatsApp botu → aynı sipariş API'sine bağlanır
- [ ] Faz 8: App Store / Google Play yayını
