# App Store ve Google Play Yayın Rehberi

## Ön koşullar
- **Apple Developer Program** (şirket adına, yıllık ücretli) — şirket hesabı için **D-U-N-S numarası** gerekir.
- **Google Play Console** (şirket hesabı, tek seferlik ücret; kuruluş doğrulaması).
- `docs/kurulum.md` adım 1–7 tamamlanmış olmalı (Supabase, SMS, panel, EAS).

## Derleme ve gönderim
```bash
cd apps/mobile
pnpm build:prod          # iOS + Android production build (EAS bulutunda)
pnpm submit:prod         # App Store Connect + Google Play (internal test kanalı)
```
- iOS: `eas.json → submit.production.ios` içindeki `ascAppId` ve `appleTeamId`'yi App Store Connect'ten doldurun.
- Android: Play Console → API erişimi → servis hesabı JSON'unu `apps/mobile/google-play-service-account.json` olarak kaydedin (git'e gönderilmez).
- İlk Android yüklemesi Play Console'dan elle yapılmalıdır; sonrasında `submit:prod` çalışır.

## Mağaza bilgileri

**Uygulama adı:** Yazgan Kurye
**Alt başlık (iOS, 30 karakter):** İstanbul moto kurye, anında
**Kategori:** İş (Business) — ikincil: Seyahat & Yerel / Haritalar ve Navigasyon
**Kısa açıklama (Google, 80 karakter):** Acil evrak ve paketiniz için moto kurye: anında fiyat, canlı takip.

**Açıklama:**
> Yazgan Kurye ile İstanbul'da acil evrak ve paketlerinizi moto kuryeyle kapıdan kapıya gönderin.
>
> • Adresleri girin, fiyatı anında görün — gizli ücret yok, tüm kalemler açık
> • Acil (60 dk), gidiş-dönüş ve büyük paket seçenekleri
> • Kuryenizi canlı takip edin, takip linkini alıcıyla paylaşın
> • Teslimatta fotoğraf ve imza ile teslim kanıtı
> • Kartla güvenli ödeme (iyzico) veya kuryeye ödeme
> • Kurumsal müşterilere ay sonu tek fatura ve hacim indirimi
> • Otomatik e-arşiv fatura
>
> Kuryelerimiz de aynı uygulamayı kullanır: vardiya, iş listesi, yol tarifi ve teslim kanıtı tek ekranda.
>
> Merkez: Beykoz / İstanbul — Anadolu yakası öncelikli, tüm İstanbul'a hizmet.

**Anahtar kelimeler (iOS, 100 karakter):** kurye,moto kurye,evrak,paket,acil kurye,istanbul,anadolu yakası,beykoz,teslimat,gönderi
**Destek URL'si:** https://panel.yazgankurye.com/gizlilik (veya web siteniz)
**Gizlilik politikası URL'si:** https://panel.yazgankurye.com/gizlilik
**Hesap silme URL'si (Google zorunlu):** https://panel.yazgankurye.com/hesap-silme

## Ekran görüntüleri
Mağazaya yüklenecek görseller repo kökündeki **`store/`** klasöründedir. Hepsi Neo dilinde "pazarlama çerçevesi"dir: üstte kısa Türkçe başlık, altında telefon çerçevesi içinde **gerçek uygulama ekranı** (DEMO modunda tarayıcıdan, 430×932 @3x; durum çubuğu ve tarayıcı arayüzü yok, saat hafta içi 10:30'a sabitlenir ki gece/Pazar eki görünmesin).

| Klasör | Boyut | Adet | Not |
|---|---|---|---|
| `store/ios-6.9/` | 1320×2868 | 6 | iPhone 6.9", alfa kanalı yok |
| `store/ios-6.5/` | 1284×2778 | 6 | iPhone 6.5", alfa kanalı yok |
| `store/android/0*.png` | 1080×1920 | 6 | Play telefon ekran görüntüsü (en-boy oranı ≤ 2:1 kuralına uyar) |
| `store/android/feature-graphic-1024x500.png` | 1024×500 | 1 | Özellik grafiği; logo ve yazı ortadaki güvenli alanda |
| `store/android/play-icon-512.png` | 512×512 | 1 | Play ikonu, 32-bit PNG (köşe maskesini Play uygular) |

Sıra (her iki mağazada aynı): 01 sipariş formu · 02 fiyat özeti · 03 canlı takip (harita + zaman çizelgesi) · 04 teslim sonrası değerlendirme · 05 kurye iş teklifleri · 06 kurye teslim (fotoğraf + imza + teslim kodu).

**Yeniden üretme** (marka adı, slogan veya ekranlar değişince):
```bash
pnpm brand:assets   # ikonlar, açılış ekranı, favicon'lar, OG görseli, özellik grafiği, Play ikonu
pnpm brand:store    # ekran görüntüleri — Expo web DEMO modunda çalışıyor olmalı (varsayılan http://localhost:8081)
```
Expo geliştirme sunucusu yavaşsa statik derlemeden alın:
```bash
pnpm --filter @yazgan/mobile export:web
node apps/mobile/e2e/serve.cjs apps/mobile/dist 8099      # ayrı terminalde açık kalsın
pnpm brand:store --url=http://localhost:8099
```
Başlık/alt yazılar `scripts/brand-assets.mts` içindeki `SHOTS` listesindedir (başlık en fazla 5 kelime; sığmayan yazı betiği hatayla durdurur, kesik görsel üretmez). Harita karoları OSM'e erişilebiliyorsa gerçek, yoksa e2e'deki sahte karodur. Daha eski e2e örnekleri: `apps/mobile/e2e/shots/`.

## İnceleme notları (App Review / Play)
İncelemecilerin giriş yapabilmesi için Supabase'de **test numaraları** tanımlayın (kurulum §4) ve şu notu ekleyin:

> Giriş SMS doğrulamalıdır. Test hesabı — Müşteri: 0555 000 00 01, kod 123456. Kurye: 0555 000 00 02, kod 123456 (kurye ekranları; vardiya başlatınca konum izni istenir).
> Arka plan konumu yalnızca kurye rolündeki kullanıcılar vardiya başlattığında, müşteriye canlı teslimat takibi sunmak için kullanılır ve vardiya bitince durur. Müşteriler konum izni vermez.
> Hesap silme: Hesabım → Hesabımı sil.

## Apple "App Privacy" etiketleri
| Veri | Toplanıyor | Kullanıcıya bağlı | İzleme | Amaç |
|---|---|---|---|---|
| Telefon numarası | Evet | Evet | Hayır | Uygulama işlevi, hesap |
| Ad | Evet | Evet | Hayır | Uygulama işlevi |
| E-posta | Evet (isteğe bağlı) | Evet | Hayır | Uygulama işlevi (fatura) |
| Fiziksel adres | Evet | Evet | Hayır | Uygulama işlevi |
| Hassas konum (yalnızca kuryeler) | Evet | Evet | Hayır | Uygulama işlevi |
| Fotoğraflar (teslim kanıtı, kurye) | Evet | Evet | Hayır | Uygulama işlevi |
| Satın alma geçmişi | Evet | Evet | Hayır | Uygulama işlevi |
| Müşteri desteği (asistan yazışmaları) | Evet | Evet | Hayır | Müşteri desteği |

Kart bilgileri uygulama tarafından toplanmaz (iyzico ödeme sayfası).

## Google Play "Veri güvenliği" formu
- Veriler aktarım sırasında şifrelenir: **Evet** (HTTPS).
- Kullanıcılar verilerinin silinmesini isteyebilir: **Evet** (uygulama içi + web URL'si).
- Toplanan: Konum (hassas, yalnız kurye; uygulama işlevi), Kişisel bilgiler (ad, e-posta, telefon, adres), Finansal bilgiler (satın alma geçmişi), Fotoğraflar (teslim kanıtı), Mesajlar (asistan yazışmaları — müşteri desteği).
- Paylaşım: Hizmet sağlayıcılarla (veri işleyen) — Google Play tanımına göre "paylaşım" sayılmaz.
- **Arka plan konumu beyanı** (Play Console → Uygulama içeriği → Konum izinleri): kısa video ile kurye vardiyası akışını gösterin; açıklama: "Kurye vardiyası boyunca, uygulama kapalıyken de konum müşteriye canlı teslimat takibi için paylaşılır; kalıcı bildirim gösterilir; vardiya bitince durur."
- **Ön plan hizmeti türü**: location (kurye konum paylaşımı).

## Sürüm notu (ilk sürüm)
> İlk sürüm: anında fiyat, sipariş, canlı takip, kartla ödeme, e-arşiv fatura, kurye uygulaması.
