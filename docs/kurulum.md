# Yazgan Kurye — Kurulum Rehberi

Kodun tamamı yazıldı ve testlerden geçti. Bu rehber, sistemi **gerçek hesaplara bağlayıp canlıya almak** için sizin yapmanız gereken adımları sırasıyla anlatır. Her adımın sonunda hangi anahtarın nereye yazılacağı belirtilmiştir.

> Anahtar girilmeyen her servis **deneme modunda** çalışır: SMS/WhatsApp gönderilmez (yalnızca loglanır), harita için örnek İstanbul adresleri kullanılır, mobil uygulama ve panel Supabase bağlanmadan **DEMO modunda** açılır. Yani adımları istediğiniz sırada, parça parça yapabilirsiniz.

## İçindekiler
1. [Supabase (veritabanı + sunucu)](#1-supabase)
2. [Yönetici hesabı](#2-yönetici-hesabı)
3. [Google Maps](#3-google-maps)
4. [SMS (Netgsm) ve telefonla giriş](#4-sms-netgsm-ve-telefonla-giriş)
5. [Yönetim paneli ve takip sayfası (Vercel)](#5-yönetim-paneli-vercel)
6. [Zamanlanmış görevler (bildirim + fatura kuyruğu)](#6-zamanlanmış-görevler)
7. [Mobil uygulama (EAS)](#7-mobil-uygulama-eas)
8. [WhatsApp Business](#8-whatsapp-business)
9. [iyzico (kartla ödeme)](#9-iyzico)
10. [Paraşüt (e-arşiv / e-fatura)](#10-paraşüt)
11. [Yapay zeka asistanı (Anthropic)](#11-yapay-zeka-asistanı)
12. [Sesli asistan (telefon)](#12-sesli-asistan)
13. [Yasal yükümlülükler](#13-yasal-yükümlülükler)
14. [Canlıya almadan önce kontrol listesi](#14-kontrol-listesi)
15. [Tüm ortam değişkenleri](#15-tüm-ortam-değişkenleri)
16. [Marka ve alan adı](#16-marka-ve-alan-adı)
17. [Web sitesi (apps/web)](#17-web-sitesi)
18. [Tarayıcıdan sipariş (app. alt alan adı)](#18-tarayıcıdan-sipariş)
19. [Google İşletme Profili ve yorumlar](#19-google-işletme-profili-ve-yorumlar)
20. [E-postayla sipariş (Postmark)](#20-e-postayla-sipariş)
21. [Kurumsal API ve webhook](#21-kurumsal-api-ve-webhook)
22. [Sistem izleme ve kesinti alarmı](#22-sistem-izleme)
23. [Kurye hakedişi ve nakit tahsilatı](#23-kurye-hakedişi-ve-nakit-tahsilatı)
24. [Kurye belgeleri ve uyum](#24-kurye-belgeleri-ve-uyum)
25. [Acil teslim taahhüdü ve tahmini varış](#25-acil-teslim-taahhüdü-60-dk-ve-tahmini-varış)
26. [Değerli gönderiler](#26-değerli-gönderiler-değer-beyanı-ve-teslim-kodu)
27. [Kampanya, davet ve geri kazanma](#27-kampanya-davet-ve-geri-kazanma)
28. [Canlıya alma: hazırlık denetimi, yedek, deneme ortamı](#28-canlıya-alma)
29. [Kurye iş teklifi (kabul / ret)](#29-kurye-iş-teklifi)
30. [Adrese varış ve bekleme ölçümü](#30-adrese-varış-ve-bekleme-ölçümü)
31. [Kurye molası](#31-kurye-molası)
32. [Acil durum (SOS)](#32-acil-durum-sos)
33. [Teslim edilemedi → göndericiye iade](#33-teslim-edilemedi--göndericiye-iade)
34. [Durak sırası](#34-durak-sırası)

---

## 1. Supabase

1. [supabase.com](https://supabase.com) → yeni proje. **Bölge: Central EU (Frankfurt)** (Türkiye'ye en yakın).
2. Proje ayarlarından şunları not edin: **Project URL**, **anon (public) key**, **service_role key** (service_role gizlidir, yalnızca sunucuda kullanılır).
3. Bilgisayarınızda (veya Claude Code'a yaptırarak) repo kökünde:
   ```bash
   pnpm install
   npx supabase login
   npx supabase link --project-ref <proje-ref>
   npx supabase db push            # tüm tablolar, güvenlik kuralları, fiyatlar, resmi tatiller
   pnpm deploy:functions           # tüm Edge Function'lar (--use-api; Docker gerekmez)
   ```
4. Gizli anahtarlar (bu rehberin ilerleyen adımlarında elde ettikçe ekleyin):
   ```bash
   npx supabase secrets set NOTIFY_SECRET=$(openssl rand -hex 24)
   npx supabase secrets set PUBLIC_TRACKING_BASE_URL=https://panel.yazgankurye.com/takip
   npx supabase secrets set ADMIN_ALERT_PHONES=+905xxxxxxxxx   # virgülle birden fazla
   npx supabase secrets set KVKK_URL=https://panel.yazgankurye.com/kvkk
   ```

**Kontrol:** Supabase → Table Editor'da `pricing_settings` (1 satır, köprü 25 TL) ve `holidays` (2026–2027) dolu olmalı.

## 2. Yönetici hesabı

1. Supabase → Authentication → Users → **Add user** → e-posta + şifre (ör. siz).
2. SQL Editor'da:
   ```sql
   update public.profiles set role = 'admin', full_name = 'Adınız Soyadınız'
   where email = 'sizin@epostaniz.com';
   ```
3. Panele bu e-posta/şifre ile girersiniz. Kuryeleri panelden **Kuryeler → Yeni kurye** ile eklersiniz; kurye uygulamaya kendi telefonuyla SMS koduyla girer.

## 3. Google Maps

1. [console.cloud.google.com](https://console.cloud.google.com) → yeni proje → Faturalandırmayı etkinleştir.
2. APIs & Services → **Places API (New)** ve **Routes API**'yi etkinleştir.
   (Eski "Distance Matrix" ve "Places API" yeni projelerde açılamıyor; kod yenilerini kullanıyor.)
3. Credentials → API key oluştur → **API restrictions**: yalnızca Places API (New) ve Routes API.
4. `npx supabase secrets set GOOGLE_MAPS_API_KEY=...`

Anahtar yalnızca sunucuda (Edge Function) kullanılır; uygulamaya gömülmez.

### Harita görüntüsü (canlı harita, takip, mobil)
Harita **görüntüsü** Google anahtarı gerektirmez: panel (Leaflet) ve mobil uygulama OpenStreetMap karolarını kullanır, demo modunda da çalışır.
OSM'in ücretsiz karo sunucusu düşük trafik içindir ([kullanım politikası](https://operations.osmfoundation.org/policies/tiles/)); müşteri sayısı arttığında ticari bir karo sağlayıcısına geçin (ör. MapTiler, Stadia Maps, Thunderforest — aylık ücretsiz kotaları vardır) ve şu değişkenleri girin:
- Panel (Vercel): `NEXT_PUBLIC_MAP_TILE_URL=https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=...` ve `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION=© MapTiler © OpenStreetMap katkıcıları`
- Mobil (EAS): `EXPO_PUBLIC_MAP_TILE_URL`, `EXPO_PUBLIC_MAP_TILE_ATTRIBUTION` (aynı değerler)

Karo anahtarı tarayıcıda/uygulamada görünür; sağlayıcı panelinden alan adı (`panel.yazgankurye.com`) ve uygulama kimliği kısıtlaması koyun.

## 4. SMS (Netgsm) ve telefonla giriş

1. Netgsm hesabı → **SMS başlığı** (ör. YAZGANKURYE) onaylatın. API kullanıcısı oluşturun.
2. ```bash
   npx supabase secrets set NETGSM_USERCODE=... NETGSM_PASSWORD=... NETGSM_HEADER=YAZGANKURYE
   ```
3. Supabase → Authentication → Providers → **Phone**: etkinleştir.
4. Authentication → **Hooks → Send SMS hook** → HTTPS → URL: `https://<ref>.supabase.co/functions/v1/send-sms` → **Generate secret** → çıkan `v1,whsec_...` değerini:
   `npx supabase secrets set SEND_SMS_HOOK_SECRETS='v1,whsec_...'`
5. **Mağaza incelemesi için test numaraları**: Authentication → Phone → Test OTP: ör. `905550000001=123456` (müşteri), `905550000002=123456` (kurye; panelden kurye olarak ekleyin).

## 5. Yönetim paneli (Vercel)

Panel aynı zamanda müşterilerin **takip sayfası** (`/takip/...`) ve mağazaların istediği **gizlilik / KVKK / hesap silme** sayfalarını barındırır.

1. [vercel.com](https://vercel.com) → GitHub reposunu içe aktar → **Root Directory: `apps/admin`** (pnpm otomatik algılanır).
2. Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (yalnızca sunucu; kurye hesabı oluşturmak için)
3. Alan adı: `panel.yazgankurye.com` (DNS'te CNAME → Vercel).
4. Supabase → Authentication → URL Configuration → Site URL: `https://panel.yazgankurye.com`.

## 6. Zamanlanmış görevler

Bildirimler ve faturalar bir kuyruğa yazılır; aşağıdaki görevler kuyruğu dakikada bir işler. Supabase → Database → Extensions: **pg_cron** ve **pg_net**'i açın, sonra SQL Editor'da (`<ref>` ve gizli değeri değiştirin):

```sql
select vault.create_secret('<NOTIFY_SECRET değeri>', 'notify_secret');

select cron.schedule('bildirim-kuyrugu', '* * * * *', $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/notify-dispatch',
    headers := jsonb_build_object('x-notify-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret'))
  );
$$);

select cron.schedule('fatura-kuyrugu', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/invoice-dispatch',
    headers := jsonb_build_object('x-notify-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret'))
  );
$$);

-- Otomatik onay + kurye atama (ayarlar: panel → Otomasyon)
select cron.schedule('otomatik-dagitim', '* * * * *', $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/auto-dispatch',
    headers := jsonb_build_object('x-notify-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret'))
  );
$$);

-- Ödeme süresi dolan kart siparişlerini iptal et (süre: panel → Operasyon ayarları)
select cron.schedule('odenmemis-kart-iptal', '*/5 * * * *', 'select public.cancel_unpaid_card_orders()');

-- Kurumsal müşterilerin webhook'ları (§21)
select cron.schedule('webhook-kuyrugu', '* * * * *', $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/webhook-dispatch',
    headers := jsonb_build_object('x-notify-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret'))
  );
$$);

-- Sistem denetimi: sorun olursa yöneticiye WhatsApp/SMS (§22)
select cron.schedule('sistem-denetimi', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/health',
    headers := jsonb_build_object('x-notify-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret'))
  );
$$);

-- Kurye hakedişi: teslim edilen siparişlerin kurye kazancı (§23)
select cron.schedule('kurye-hakedis', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/courier-earnings',
    headers := jsonb_build_object('x-notify-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret'))
  );
$$);

-- Geri kazanma mesajı (günlük 11:00 İstanbul; panel → Kampanyalar'dan açılır, §27)
select cron.schedule('geri-kazanma', '0 8 * * *', $$
  select net.http_post(
    url := 'https://<ref>.supabase.co/functions/v1/winback',
    headers := jsonb_build_object('x-notify-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret'))
  );
$$);

-- Eski hız sınırı sayaçlarını temizle (günlük)
select cron.schedule('hiz-siniri-temizlik', '17 4 * * *', 'select public.purge_rate_limits()');
```

Panel → Otomasyon → **Sistem durumu** kartında her görevin en son ne zaman çalıştığı görünür; "hiç çalışmadı" yazan görevin cron kaydı eksiktir.

## 7. Mobil uygulama (EAS)

1. [expo.dev](https://expo.dev) hesabı → `cd apps/mobile && npx eas-cli@latest init` → çıkan **projectId** `app.json → expo.extra.eas.projectId`'ye yazılır (push bildirimleri için gerekli).
2. EAS → Project → Environment variables (production/preview):
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_TRACKING_BASE_URL=https://panel.yazgankurye.com/takip`
3. Test sürümü (telefona kurulur): `pnpm --filter @yazgan/mobile build:preview`
4. Push bildirimleri: Android için EAS'a FCM V1 anahtarı, iOS için APNs anahtarı yüklenir (`eas credentials`). İsteğe bağlı `EXPO_ACCESS_TOKEN` secret'ı.
5. **Arka plan konumu** (kurye) ve kamera yalnızca gerçek build'de çalışır (Expo Go'da değil).
6. Mağaza yayını için `docs/magaza.md`'ye bakın.

## 8. WhatsApp Business

1. [business.facebook.com](https://business.facebook.com) → işletme doğrulaması → WhatsApp Business hesabı → telefon numarası ekle.
2. developers.facebook.com → uygulama → WhatsApp → **Phone number ID** ve kalıcı **access token** (System User).
3. **Mesaj şablonları** (Kategori: *Utility*, Dil: Türkçe) — adlar koddakiyle birebir aynı olmalı:

   | Şablon adı | Metin (önerilen) |
   |---|---|
   | `siparis_alindi` | `{{1}} numaralı siparişiniz alındı. Canlı takip: {{2}}` |
   | `alici_gonderi_yolda` | `Merhaba {{1}}, size gönderilen paket Yazgan Kurye ile yola çıktı. Canlı takip: {{2}}` |
   | `alici_gonderi_yolda_kod` | `Merhaba {{1}}, size gönderilen paket Yazgan Kurye ile yola çıktı. Teslim kodunuz: {{2}} (paketi alırken kuryeye söyleyin). Canlı takip: {{3}}` |
   | `teslim_edildi` | `{{1}} numaralı gönderi teslim edildi. Teslim alan: {{2}}` |
   | `yonetici_uyari` | `Yazgan Kurye uyarı: {{1}}` |
   | `geri_kazanma` (Kategori: *Marketing*) | `Merhaba {{1}}, sizi özledik! Sonraki gönderinizde {{2}} indirim: {{3}} (14 gün geçerli). Mesaj almak istemiyorsanız RET yazın.` |
   | `acil_gecikme` | `{{1}} numaralı acil gönderiniz gecikebilir, tahmini teslim {{2}}. Taahhüt aşılırsa acil ek ücreti sonraki siparişinizden düşülür. Takip: {{3}}` |
   | `kurye_alista` | `Kuryemiz {{1}}, {{2}} numaralı gönderi için alış adresinizde. Paketi hazırlayabilirsiniz.` |
   | `alici_kurye_kapida` | `Merhaba {{1}}, Yazgan Kurye kuryesi {{2}} adresinizde; paketinizi teslim almak için hazır olun.` |
   | `teslim_edilemedi` | `{{1}} numaralı gönderiniz teslim edilemedi ({{2}}). Paket size geri getiriliyor; dönüş ayağı ücreti eklenir. Takip: {{3}}` |
   | `alici_kurye_kapida_kod` | `Merhaba {{1}}, Yazgan Kurye kuryesi {{2}} adresinizde; paketinizi teslim almak için hazır olun. Teslim kodunuz: {{3}}.` |

4. Webhook: Callback URL `https://<ref>.supabase.co/functions/v1/whatsapp-webhook`, Verify token: kendi belirlediğiniz rastgele metin → **messages** alanına abone olun.
5. ```bash
   npx supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... \
     WHATSAPP_APP_SECRET=<uygulama gizli anahtarı> WHATSAPP_VERIFY_TOKEN=<belirlediğiniz metin>
   ```

## 9. iyzico

1. iyzico üye işyeri başvurusu (şirket evrakı). Onay beklerken **sandbox** hesabı açın.
2. ```bash
   npx supabase secrets set IYZICO_API_KEY=... IYZICO_SECRET_KEY=... IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
   ```
3. Uygulamada "Kartla online ödeme" → iyzico test kartıyla ödeme → sipariş "Ödendi" olmalı, panelde "Ödenen" görünmeli.
4. Canlıya geçişte `IYZICO_BASE_URL=https://api.iyzipay.com` ve canlı anahtarlar.
5. Aynı gün iptallerde ödeme otomatik iptal edilir; gün geçtiyse sipariş **"İade bekliyor"** olur → iyzico panelinden iade yapın.

## 10. Paraşüt

1. Paraşüt hesabı + **e-Arşiv / e-Fatura** aktivasyonu (mali mühür / GİB süreci Paraşüt üzerinden).
2. Paraşüt destekten **API erişimi** isteyin (client_id / client_secret verilir). Şirket ID'si panel adresindeki sayıdır.
3. Paraşüt'te "Kurye hizmeti" adlı bir ürün/hizmet oluşturup ID'sini alın (isteğe bağlı).
4. ```bash
   npx supabase secrets set PARASUT_CLIENT_ID=... PARASUT_CLIENT_SECRET=... \
     PARASUT_USERNAME=<paraşüt e-posta> PARASUT_PASSWORD=... PARASUT_COMPANY_ID=... PARASUT_PRODUCT_ID=...
   ```
5. Bireysel teslimatlar otomatik faturalanır; kurumsal hesaplar için panel → **Kurumsal & fatura → Hesapla → Faturayı oluştur** (yalnızca biten aylar). Durum: panel → **Faturalar**.

## 11. Yapay zeka asistanı

1. [console.anthropic.com](https://console.anthropic.com) → API key.
2. `npx supabase secrets set ANTHROPIC_API_KEY=...`
3. Varsayılan model `claude-opus-5-5`. İsteğe bağlı: `ASSISTANT_MODEL` (ör. maliyeti düşürmek için `claude-sonnet-5-5` veya `claude-haiku-5-5`), `ASSISTANT_EFFORT` (`low`/`medium`/`high`, varsayılan `medium`).
4. Asistan, güvenlik sınıflandırıcısı bir mesajı reddederse otomatik olarak Anthropic'in önerdiği yedek modelde tekrar dener (`fallbacks: "default"`); yine olmazsa konuşmayı temsilciye devreder.
5. Devredilen konuşmalar: panel → **Asistan konuşmaları**.

## 12. Sesli asistan

Telefon aramasını metne/sese çeviren bir servis gerekir (ör. Twilio ConversationRelay veya Netgsm'in sesli yanıt ürünü). Bu servis her konuşma parçasını şu adrese gönderir:

```
POST https://<ref>.supabase.co/functions/v1/assistant-voice
x-voice-secret: <VOICE_GATEWAY_SECRET>
{"session_id": "<arama kimliği>", "caller": "+905...", "text": "<müşterinin söylediği>"}
→ {"reply": "<sese çevrilecek yanıt>", "transfer_to_human": false}
```

`transfer_to_human: true` gelirse arama size yönlendirilmelidir. `npx supabase secrets set VOICE_GATEWAY_SECRET=$(openssl rand -hex 24)`

## 13. Yasal yükümlülükler

`docs/fiyat-arastirmasi.md` §5 özetler; mutlaka bir hukukçu / mali müşavir ile teyit edin:
- **BTK yetkilendirmesi** (6475 sayılı Posta Hizmetleri Kanunu) — evrak/paket kurye faaliyeti için gerekli; kurye çalışma saatleri raporu panelde (**Çalışma saatleri (BTK)** → CSV).
- **Ulaştırma Bakanlığı** moto kurye yetki belgesi ve SRC Kurye belgeleri.
- **KVKK**: VERBİS kaydı; aydınlatma metni, gizlilik politikası ve açık rıza metinleri `packages/shared/legal.ts` içinde — hukukçu kontrolünden sonra güncelleyip `KVKK_VERSION`'ı artırın (kullanıcılardan yeniden onay alınır).

## 14. Kontrol listesi

Buradaki kodlar birim/uçtan uca testlerle doğrulandı, ancak dış servislere bu ortamdan bağlanılamadığı için **gerçek hesaplarla bir kez denenmesi gerekenler**:

- [ ] Telefonla giriş: Netgsm SMS gerçekten geliyor mu? (Netgsm REST v2 uç noktası)
- [ ] Google: gerçek adres arama ve mesafe; Anadolu/Avrupa yaka tespiti örnek adreslerde doğru mu?
- [ ] iyzico sandbox: ödeme → callback → "Ödendi"; iptal → iade
- [ ] Paraşüt: bireysel e-arşiv faturası kesildi mi, PDF bağlantısı geldi mi; kurumsal e-fatura mükellefi için e-fatura
- [ ] WhatsApp: şablon mesajlar ve bot yanıtı; tekrar gelen mesaj tek yanıt alıyor mu
- [ ] Push bildirimi gerçek telefonda; kurye **arka plan konumu** (Android bildirimi, iOS "Her zaman" izni)
- [ ] Teslim fotoğrafı/imza yüklenip panelde görüntüleniyor mu
- [ ] Zamanlanmış görevler dakikada bir çalışıyor mu (Supabase → Edge Functions → Logs)
- [ ] Haritalar: panel "Canlı harita"da vardiyadaki kurye görünüyor mu; müşteri uygulamasında kurye işareti teslimat boyunca ilerliyor mu (Realtime + 30 sn yedek okuma)
- [ ] Raporlar: bir aylık gerçek veriyle ciro ve CSV (Excel'de Türkçe karakterler ve ondalık virgül doğru mu)
- [ ] Web sitesi: fiyat hesaplayıcı gerçek adreslerle; kurumsal başvuru ve kurye başvurusu (belge yükleme) panelde Başvurular'a düşüyor mu
- [ ] Tarayıcıdan sipariş: app.<alan adı> üzerinden giriş (SMS), sipariş ve kartla ödeme dönüşü
- [ ] E-postayla sipariş: kayıtlı müşteri e-postasıyla deneme siparişi; yanıt aynı konuya geliyor mu
- [ ] Kurumsal API: test anahtarıyla `/api/v1/ping`, sipariş aç, webhook'un imzasını doğrula
- [ ] Değerlendirme: teslim SMS'indeki bağlantıdan puan; 5 puanda Google yorum sayfası açılıyor mu
- [ ] Kesinti izleyicisi (UptimeRobot) kuruldu, test alarmı geldi
- [ ] Kurye hakedişi: gerçek ödeme modeli girildi (Fiyatlar), bir haftalık hesaplaşma kuryeyle karşılaştırıldı
- [ ] Kurye belgeleri: tüm kuryelerin zorunlu belgeleri bitiş tarihleriyle girildi
- [ ] Acil taahhüt: gecikme uyarısı (`acil_gecikme`) ve telafi kredisi bir deneme siparişinde görüldü
- [ ] Teslim kodu: alıcıya kodlu SMS/WhatsApp geldi, kurye kodu doğrulayıp teslim etti
- [ ] Sigorta poliçesi değer beyanı sınırını karşılıyor; geri kazanma açılmadan önce İYS kaydı yapıldı
- [ ] Panel → Otomasyon → **Canlıya hazırlık**: "eksik" madde kalmadı (§28)

## 15. Tüm ortam değişkenleri

| Nerede | Değişken | Açıklama |
|---|---|---|
| Supabase secrets | `GOOGLE_MAPS_API_KEY` | Places (New) + Routes |
| | `NETGSM_USERCODE`, `NETGSM_PASSWORD`, `NETGSM_HEADER` | SMS |
| | `SEND_SMS_HOOK_SECRETS` | Supabase SMS hook imzası |
| | `NOTIFY_SECRET` | Zamanlanmış görev çağrıları |
| | `PUBLIC_TRACKING_BASE_URL`, `KVKK_URL` | Mesajlardaki bağlantılar |
| | `ADMIN_ALERT_PHONES` | Yeni sipariş / sorun uyarıları |
| | `EXPO_ACCESS_TOKEN` (isteğe bağlı) | Push güvenliği |
| | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION` (ops.) | WhatsApp |
| | `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL` | Ödeme |
| | `PARASUT_CLIENT_ID`, `PARASUT_CLIENT_SECRET`, `PARASUT_USERNAME`, `PARASUT_PASSWORD`, `PARASUT_COMPANY_ID`, `PARASUT_PRODUCT_ID` (ops.) | Fatura |
| | `ANTHROPIC_API_KEY`, `ASSISTANT_MODEL` (ops.), `ASSISTANT_EFFORT` (ops.) | Asistan |
| | `VOICE_GATEWAY_SECRET` | Sesli asistan |
| | `GOOGLE_REVIEW_URL` (ops.) | 5 puan verenlerin yönlendirildiği Google yorum bağlantısı (§19) |
| | `APP_WEB_ORIGINS` (ops.) | Tarayıcıdan ödemede ek izinli dönüş kökenleri (§18) |
| | `POSTMARK_SERVER_TOKEN`, `EMAIL_INBOUND_SECRET`, `EMAIL_FROM` (ops.), `EMAIL_OWN_DOMAINS` (ops.), `EMAIL_REQUIRE_AUTH` (ops.) | E-postayla sipariş (§20) |
| Vercel (panel) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | |
| | `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION` (ops.) | Harita karoları (§3) |
| Vercel (web sitesi) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` (ops.), `NEXT_PUBLIC_APP_URL` (ops.), `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` (ops.) | §17 |
| EAS (mobil) | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_TRACKING_BASE_URL` | |
| | `EXPO_PUBLIC_MAP_TILE_URL`, `EXPO_PUBLIC_MAP_TILE_ATTRIBUTION` (ops.) | Harita karoları (§3) |
| `app.json` | `expo.extra.eas.projectId` | Push bildirimleri |

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` Edge Function'lara Supabase tarafından otomatik verilir.

## 16. Marka ve alan adı

Marka adı ve alan adı **tek dosyada**: `packages/shared/brand.ts`. Yeni adı/alan adını aldığınızda yalnızca şunları değiştirin:

- `DOMAIN` (ör. `ornekkurye.com`), `name`, `shortName`, `slogan`
- `phone` ve `whatsapp` (doluysa sitede görünür), `googleReviewUrl` (§19)

Web sitesi, panel, takip linkleri, SMS/WhatsApp metinleri, asistan ve yasal metinler buradan okur. Bu dosyadan türeyen adresler: site `https://<alan adı>`, panel ve takip `https://panel.<alan adı>`, tarayıcıdan sipariş `https://app.<alan adı>`, e-posta `siparis@`, `info@`, `kvkk@<alan adı>`.

Ayrıca elle güncellenecekler:
- `apps/mobile/app.json` → `name` (mağazada görünen ad). `scheme` ve paket kimliği (`com.yazgankurye.app`) mağazaya ilk gönderimden **önce** değiştirilebilir; sonra değiştirilemez. `scheme` değişirse `brand.ts → appScheme` de aynı yapılmalı.
- SMS başlığı: Netgsm'de onaylı başlık (`NETGSM_HEADER`).
- WhatsApp Business görünen adı (Meta onayı gerekir).

## 17. Web sitesi

`apps/web` tanıtım sitesidir: fiyat hesaplayıcı, fiyatlar, kurumsal başvuru, ilçe sayfaları (SEO), SSS, kurye başvurusu, API belgeleri, KVKK/gizlilik.

1. Vercel → yeni proje → aynı repo → **Root Directory: `apps/web`**.
2. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (girilmezse site örnek adreslerle **demo** çalışır).
3. Alan adı: kök alan adı ve `www` → Vercel (www'yi köke yönlendirin).
4. [Google Search Console](https://search.google.com/search-console) → alan adını ekleyin → doğrulama kodunu `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` olarak girin → **Site haritası**: `https://<alan adı>/sitemap.xml`.
5. Fiyat hesaplayıcı girişsiz çalışır; Google maliyetine karşı IP başına (10 dakikada 30 fiyat) ve günlük toplam (3.000) sınır vardır (`supabase/functions/_shared/site.ts → SITE_LIMITS`).

## 18. Tarayıcıdan sipariş

Mobil uygulama tarayıcıda da çalışır (Expo web); sitedeki "Sipariş ver" düğmeleri buraya gider.

1. Vercel → yeni proje → **Root Directory: `apps/mobile`** (`vercel.json` hazır: derleme ve tek sayfa yönlendirmesi).
2. Environment Variables: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_TRACKING_BASE_URL=https://panel.<alan adı>/takip`.
3. Alan adı: `app.<alan adı>`.
4. Kartla ödemede iyzico, ödemeden sonra `https://app.<alan adı>/odeme` adresine döner. Başka bir adres kullanırsanız Supabase secrets'a `APP_WEB_ORIGINS=https://...` ekleyin (yalnız izinli adreslere dönülür).

## 19. Google İşletme Profili ve yorumlar

Yerel aramalarda ("Beykoz kurye", "Kadıköy moto kurye") görünmenin en etkili yolu:

1. [business.google.com](https://business.google.com) → **Hizmet bölgesi işletmesi** olarak kaydolun (adres gizlenebilir). Kategori: **Kurye hizmeti**; ek kategori: Teslimat hizmeti.
2. Hizmet bölgeleri: sitedeki ilçeler (`apps/web/src/lib/districts.ts`).
3. Çalışma saatleri, telefon, web sitesi (`https://<alan adı>`), açıklama (`docs/magaza.md` açıklamasından uyarlayın), fotoğraflar (kurye, motor, logo).
4. Doğrulama (posta kartı/video) sonrası **Yorum iste** → "yorum yazma" bağlantısını kopyalayın → `brand.ts → googleReviewUrl` veya Supabase secret `GOOGLE_REVIEW_URL`.
5. Teslim SMS'inde değerlendirme bağlantısı gider; **5 puan** verenler bu Google bağlantısına davet edilir, **3 ve altı** puanlar size anında WhatsApp/SMS ile bildirilir. Puanlar: panel → Raporlar.

## 20. E-postayla sipariş

Kayıtlı müşteriler `siparis@<alan adı>` adresine yazar; yapay zeka asistanı (WhatsApp ile aynı) e-postayla yanıtlar, onay alınca siparişi açar.

1. [postmarkapp.com](https://postmarkapp.com) hesabı → Server oluşturun.
2. **Gönderim**: Sender Signatures → alan adınızı ekleyin, verilen **DKIM** ve **Return-Path** DNS kayıtlarını girin. Server API token → secret `POSTMARK_SERVER_TOKEN`.
3. **Gelen**: Inbound stream → **Inbound domain**: `siparis.<alan adı>` için MX kaydı `inbound.postmarkapp.com` (öncelik 10). Kendi e-posta sağlayıcınızda `siparis@<alan adı>` → `x@siparis.<alan adı>` yönlendirmesi yapın (veya doğrudan Postmark'ın verdiği adrese yönlendirin).
4. Inbound webhook URL: `https://postmark:<EMAIL_INBOUND_SECRET>@<ref>.supabase.co/functions/v1/email-inbound` — "Include raw email content" kapalı kalabilir. `EMAIL_INBOUND_SECRET` için uzun rastgele bir değer üretip secret olarak da girin.
5. Güvenlik: yalnızca **profilindeki e-posta adresiyle eşleşen kayıtlı müşterilerin**, **SPF veya DKIM doğrulamasından geçen** e-postaları işlenir; diğerlerine yönlendirme yanıtı gider. Gönderen başına günde en fazla 40 e-posta işlenir. Müşteri e-posta adresini uygulamada Hesabım bölümünden ekler.
6. Yazışmalar panel → Asistan konuşmaları'nda "E-posta" kanalıyla görünür.

## 21. Kurumsal API ve webhook

1. Panel → Müşteriler: firmanın kullanıcısını kurumsal hesaba bağlayın (siparişler onun adına açılır; kullanıcının uygulamada KVKK onayı vermiş olması gerekir).
2. Panel → Kurumsal & fatura → **API ve webhook** → hesap seçin → **Anahtar oluştur**. Anahtar yalnızca bir kez gösterilir; firmaya güvenli kanaldan iletin. Gerekirse "İptal et".
3. Webhook: firmanın verdiği `https://` adresini ve üretilen gizli anahtarı kaydedin; gizli anahtarı firmaya iletin (imza doğrulaması için).
4. API adresi: `https://<alan adı>/api/v1` (web sitesi Supabase'e yönlendirir; `NEXT_PUBLIC_SUPABASE_URL` girilmiş olmalı). Belge: `https://<alan adı>/api-belgeleri`.
5. API siparişleri cari hesaba işlenir, ay sonu faturasına girer. Webhook teslim kayıtları aynı kartta görünür.

## 22. Sistem izleme

- **İç denetim** (§6 `sistem-denetimi`): 5 dakikada bir kuyruklar, faturalar, webhook'lar, bekleyen siparişler, kurye konumları ve zamanlanmış görevler kontrol edilir. Yeni sorun ve düzelme `ADMIN_ALERT_PHONES`'a WhatsApp/SMS ile bildirilir (aynı sorun en fazla 6 saatte bir hatırlatılır). Panel → Otomasyon → Sistem durumu.
- **Dış kesinti izleyicisi**: [uptimerobot.com](https://uptimerobot.com) (ücretsiz) → üç HTTP izleyici:
  - `https://<ref>.supabase.co/functions/v1/health` — yanıt `"status":"ok"` içermeli (anahtar kelime izleyicisi). Ayrıntı vermez, herkese açıktır.
  - `https://<alan adı>` ve `https://panel.<alan adı>/giris`
  Bildirim kanalı olarak telefonunuzu (SMS/uygulama) ekleyin. Supabase tamamen erişilemezse iç denetim de çalışamayacağı için bu dış izleyici gereklidir.

## 23. Kurye hakedişi ve nakit tahsilatı

- **Ödeme modeli**: panel → Fiyatlar → *Kurye ödeme ve maliyet modeli* (iş başı, km başı, acil ve gece/Pazar/tatil primi, ekonomide iş başı oranı, bekleme payı). Köprü geçişi kuryeye aynen iade edilir. Varsayılanlar öneridir (esnaf kurye: iş başı 150 TL + km başı 12 TL, yakıt kuryede); kuryelerle anlaştığınız rakamları girip kaydedin. Aynı model Fiyatlar sayfasındaki marj tahminini de besler.
- **Hakediş**: §6 `kurye-hakedis` görevi teslim edilen her siparişin kurye kazancını 5 dakikada bir yazar (sipariş anındaki teklif ve o anki ödeme modeliyle). Panel → *Hakediş ve tahsilat* → "Hakedişleri güncelle" ile hemen de çalıştırılabilir. Kurye kendi kazancını uygulamada **Kazancım** sekmesinde görür.
- **Nakit**: kuryeye ödemeli siparişte kurye teslimde "Nakit aldım / IBAN'a gönderdi / Alınamadı" seçer. Nakit kuryede kalır ve hakedişten düşülür; IBAN ve alınamayanlar *Tahsil edilecekler* listesine düşer, para hesaba geçince "Ödeme alındı" işaretlenir. IBAN ile ödeyecek müşterilere şirket IBAN'ını SMS/WhatsApp şablonlarında veya faturada verin.
- **Hesaplaşma**: *Hesaplaş* o ana kadarki teslimatları kapatır. Net artıysa kuryeye o kadar ödeme yapın; eksiyse kurye elindeki nakitten o kadarını şirkete teslim eder. Yanlış hesaplaşma iptal edilebilir; teslimatlar yeniden ödenmemiş listesine döner. Her hesaplaşmanın dökümü CSV olarak indirilebilir (muhasebeciniz için).
- **Vergi/SGK**: Esnaf (vergi muafiyetli veya şahıs şirketi) kuryelere yapılan ödemelerin belgelendirmesi (gider pusulası, fatura, stopaj) mali müşavirinizle netleştirilmelidir (docs/fiyat-arastirmasi.md §8.6).

## 24. Kurye belgeleri ve uyum

- **Belgeler**: panel → Kuryeler → *Belgeler*. Zorunlu: sürücü belgesi, kurye faaliyet belgesi, motosiklet ruhsatı, zorunlu trafik sigortası. İsteğe bağlı: SRC, muayene, kasko/ferdi kaza, adli sicil, vergi levhası. Bitiş tarihi ve isteğe bağlı dosya (fotoğraf/PDF, özel `courier-docs` deposu) girilir. Başvurudan gelen belgeler Başvurular sayfasındadır; onaydan sonra buraya tarihleriyle girin.
- **Zorunluluk**: panel → Otomasyon → *Belgesi eksik kuryeyi çalıştırma* (varsayılan açık). Açıkken zorunlu belgesi eksik veya süresi dolmuş kurye vardiya başlatamaz, vardiyadayken belgesi dolarsa otomatik iş almaz. Belge bitiş günü dahil geçerlidir (İstanbul saati).
- **Uyarılar**: Süresi dolan ve *Belge süresi uyarısı (gün)* içinde dolacak belgeler sistem denetiminde (§22) yöneticiye bildirilir; kurye de uygulamada uyarı görür (İşlerim, Hesabım → Belgelerim).
- **Bildirim listesi**: Kuryeler → *Kurye listesi (CSV)* belge numaraları ve bitiş tarihleriyle; Ulaştırma Bakanlığı kurye bildirimi ve sigorta için kullanılabilir. Şirketin **P1 yetki belgesi** şirket düzeyindedir, burada tutulmaz.

## 25. Acil teslim taahhüdü (60 dk) ve tahmini varış

- **Taahhüt**: acil siparişte `sla_due_at` = sipariş zamanı (planlıysa alış zamanı, kartla ödemede ödeme zamanı) + panel → Otomasyon → *Acil teslim taahhüdü (dk)* (varsayılan 60).
- **Erken uyarı**: §6 `otomatik-dagitim` görevi her dakika açık acil siparişlerin tahmini teslimini (kurye konumu, rota süresi, ortalama 25 km/s) hesaplar. Taahhüt aşılacaksa yöneticiye ve müşteriye **bir kez** haber verir (WhatsApp şablonu `acil_gecikme`, yoksa SMS/push).
- **Telafi**: teslim taahhütten sonra olursa acil ek ücreti kadar `customer_credits` kaydı açılır ve müşterinin **sonraki siparişinden otomatik düşülür** (teklifte "Telafi" satırı). İade işlemi gerekmez; kart ödemesi değişmez.
- **Görünürlük**: takip sayfası ve müşteri uygulaması tahmini teslim saatini ve taahhüdü gösterir; panelde acil siparişlerde kalan süre / "GECİKTİ" / "Taahhüt kaçtı" rozeti vardır.

## 26. Değerli gönderiler: değer beyanı ve teslim kodu

- **Değer beyanı**: müşteri gönderinin değerini girerse ücretsiz güvenceyi (varsayılan 1.000 TL) aşan kısım için sigorta ücreti fiyata eklenir (varsayılan %0,5, en az 25 TL; en fazla 100.000 TL beyan). Tümü panel → Fiyatlar'dan değişir; kurumsal indirime tabi değildir. **Bu tutarların bir sigorta poliçesiyle (emtia/nakliyat sorumluluk) karşılanması gerekir**; teminat sınırını poliçenize göre ayarlayın.
- **Teslim kodu**: "Teslim kodu ile teslim" seçilen siparişte 4 haneli kod üretilir. Müşteri uygulamada görür; alıcıya gönderi yola çıkınca SMS/WhatsApp ile gider (şablon `alici_gonderi_yolda_kod`). Kurye kodu teslim ekranında doğrular; 5 yanlış denemede kilitlenir. Kurye kodu göremez. Yönetici gerekirse siparişi panelden kodsuz kapatabilir (sipariş detayında kod ve yanlış deneme sayısı görünür).
- **Kurumsal API**: `declaredValueKurus` ve `deliveryCode` alanları; kod oluşturma yanıtında `order.deliveryCode` olarak döner.

## 27. Kampanya, davet ve geri kazanma

- **Kampanya kodları**: panel → Kampanyalar. Yüzde veya tutar; en fazla indirim, en düşük sipariş, son gün, toplam kullanım ve "yalnız ilk sipariş" koşulları. Müşteri kodu uygulamada sipariş özetinde, WhatsApp/e-posta asistanında veya kurumsal API'de (`promoCode`) girer; kod sunucuda doğrulanır. İndirim taşıma bedeline uygulanır, köprü/bekleme/sigorta/uzak alış indirimsizdir; kurumsal ay sonu indirimi indirimli tutar üzerinden hesaplanır. İptal edilen siparişin kod kullanımı geri alınır.
- **Davet**: her bireysel müşterinin uygulamada (Hesabım) davet kodu vardır. Yeni müşteri ilk siparişinde bu kodu girerse *Davet ödülü* kadar indirim alır; gönderisi teslim edilince davet edene aynı tutarda kredi yazılır ve sonraki siparişinden otomatik düşülür. Tutar panel → Kampanyalar'dan (0 = kapalı).
- **Geri kazanma**: varsayılan **kapalı**. Açılırsa §6 `geri-kazanma` görevi günde bir kez, **ticari ileti onayı veren**, en az bir teslimatı olan ve belirlenen gün kadar sipariş vermeyen bireysel müşterilere kişiye özel, tek kullanımlık, 14 gün geçerli indirim kodu gönderir (aynı kişiye en fazla 60 günde bir).
  - **Yasal**: ticari elektronik ileti için **İYS (iys.org.tr)** kaydı ve izin yüklemesi zorunludur; SMS sağlayıcınızda (Netgsm) İYS entegrasyonunu açın. WhatsApp şablonu *Marketing* kategorisinde onaylanmalıdır.
  - Müşteri "RET" yazarsa onayı kaldırılır ve bir daha kampanya mesajı gitmez (sipariş bilgilendirmeleri devam eder).

## 28. Canlıya alma

- **Hazırlık denetimi**: panel → Otomasyon → *Canlıya hazırlık* (`readiness` Edge Function, yalnız yönetici). Hangi servisin gerçek, hangisinin sahte (deneme) sağlayıcıyla çalıştığını, iyzico'nun test ortamında olup olmadığını, zamanlanmış görevlerin son çalışmasını, tarife / kurye ödeme modeli / gelecek yıl tatillerinin girilip girilmediğini ve belgeleri tam kurye sayısını gösterir. Gizli anahtarların değerini asla göstermez, yalnız "var/yok". **"Eksik" madde kalmadan gerçek müşteri almayın**; "uyarı" maddeleri bilinçli bırakılabilir (ör. WhatsApp yokken SMS).
- **Deneme ortamı (staging)**: ikinci bir ücretsiz Supabase projesi açın, aynı migration'ları ve fonksiyonları oraya yükleyin (§1). Deneme projesinde iyzico **sandbox**, Netgsm yerine boş bırakılmış SMS (deneme modu) kullanın; panelin ikinci bir Vercel ortamını (Preview) bu projeye bağlayın. Fiyat veya otomasyon değişikliğini önce orada deneyin.
- **Yedekleme**:
  - Supabase Pro planı günlük yedek alır (7 gün). Gerçek müşteri verisi için **PITR** (anlık geri dönüş) eklentisini açın: Dashboard → Database → Backups.
  - Ek olarak haftada bir dış kopya: `npx supabase db dump --data-only -f yedek-$(date +%F).sql` (bilgisayarınızda; dosya kişisel veri içerir, şifreli diskte saklayın, 2 yıldan eski kopyaları silin — KVKK saklama süresi).
  - Teslim fotoğrafları ve belgeler Storage'dadır; veritabanı yedeğine dahil değildir. Gerekirse `supabase storage` ile ayda bir indirin.
- **Hata izleme**: Edge Function hataları Supabase → Edge Functions → Logs'ta; panel/web hataları Vercel → Logs'ta. Önemli sorunlar zaten yöneticiye mesajla gelir (§22). Daha fazlası istenirse Supabase *Log Drains* ile bir log servisine (ör. Better Stack) aktarılabilir.
- **Geri alma**: kötü bir sürümde panel için Vercel → Deployments → önceki sürüm → *Promote*; fonksiyonlar için önceki commit'e dönüp `pnpm deploy:functions`. Veritabanı migration'ları geri alınmaz; düzeltme yeni migration ile yapılır.

## 29. Kurye iş teklifi

- **Nasıl çalışır**: otomatik atama (§6 `otomatik-dagitim`) işi kuryeye **teklif** olarak gönderir. Kurye uygulamasında telefon titrer, geri sayımlı bir kart çıkar: *Kabul et* ya da *Reddet* (hazır nedenler: çok uzak, elimde başka iş var, paket aracıma uygun değil, mola vereceğim, diğer). Uygulama kapalıysa push/SMS ile "Yeni iş teklifi" gider.
- **Süre**: panel → Otomasyon → *Teklif yanıt süresi (sn)* (varsayılan 60). Süre dolarsa iş sıradaki uygun kuryeye geçer; yanıt vermeyen kuryeye aynı iş 10 dakika, reddedene hiç tekrar önerilmez. Kabul edilmemiş teklifte kurye paketi alamaz.
- **Müşteri**: "Kurye atandı" bildirimi kurye kabul edince gider (ret/süre dolması müşteriye yansımaz).
- **Yönetici ataması** teklif değildir, doğrudan geçerlidir (kuryeyi telefonla aradığınız durumlar için). Teklif özelliğini kapatmak için Otomasyon → *İşi kuryeye teklif olarak gönder* işaretini kaldırın.
- **Kayıt**: her teklif ve sonucu (`courier_offers`) sipariş detayında *Kurye teklifleri* kartında; kabul oranı kurye performansında kullanılır.

## 30. Adrese varış ve bekleme ölçümü

- **Otomatik varış**: kuryenin konumu alış/teslim adresine *Otomatik varış mesafesi* (varsayılan 100 m) yaklaşınca varış işaretlenir. Doğruluğu 100 m'den kötü konum sayılmaz. Kurye uygulamada *Alış/Teslim adresine vardım* da diyebilir; bunun için adrese en fazla *'Vardım' için en fazla uzaklık* (300 m) mesafede olmalı. İkisi de panel → Otomasyon'dan değişir.
- **Mesajlar**: alışa varışta gönderene (alış yetkilisi müşteriden farklıysa ona WhatsApp/SMS, değilse müşteriye) "kurye kapıda"; teslime varışta alıcıya "kurye adresinizde" (teslim kodu varsa kodla birlikte). WhatsApp şablonları: `kurye_alista`, `alici_kurye_kapida`, `alici_kurye_kapida_kod` (§8).
- **Bekleme ücreti**: varış kaydı varsa bekleme, varıştan paketin alınmasına kadar **otomatik ölçülür** (planlı alışta planlanan saatten önce geçen süre sayılmaz) ve kuryenin elle girdiği değerin yerine geçer. Varış yoksa kuryenin girdiği süre kullanılır. Sipariş detayında "varıştan ölçüldü / kuryenin girdiği" diye görünür; itirazlarda bu kaydı kullanın.
- **Müşteri**: uygulamada "Kurye alış adresinde / teslim adresinde" satırı görünür.

## 31. Kurye molası

- **Kurye**: vardiyadayken *Mola ver*; molada yeni iş teklifi gelmez, bekleyen teklifler geri alınır (kabul oranını etkilemez). Elinde iş yoksa molada konumu paylaşılmaz. *Moladan dön* ile devam eder; vardiya bitince açık mola da kapanır.
- **Otomatik mola**: üst üste *Yanıtsız teklif sonrası otomatik mola* (varsayılan 3) teklife yanıt vermeyen kurye molaya alınır ve push/SMS ile haber verilir (telefonu cebinde unutan kuryeye iş gitmeye devam etmesin). 0 = kapalı.
- **Uzun mola**: *En uzun mola* (varsayılan 45 dk) aşılınca yöneticiye bir kez WhatsApp/SMS uyarısı gider.
- **BTK raporu**: panel → Çalışma saatleri. Vardiya başına mola süresi ve **net çalışma** süresi; CSV'de *Mola (saat)* ve *Net çalışma (saat)* sütunları.
- Panelde molada olan kurye *Molada* olarak (kurye listesi, genel bakış, canlı harita) görünür; elle atama listesinde "molada" uyarısıyla yer alır.

## 32. Acil durum (SOS)

- **Kurye**: vardiyadayken İşlerim ekranında *🚨 Acil durum (SOS)* → tür (kaza, tehlike/saldırı, sağlık, araç arızası, diğer) → *Yöneticiye acil durum bildir*. Ekranda önce **112 Acil Çağrı** düğmesi vardır; hayati tehlikede önce 112 aranmalıdır. Alarm verilen kurye molaya alınır (yeni iş gelmez, bekleyen teklifler geri alınır).
- **Yönetici**: `ADMIN_ALERT_PHONES` numaralarına **hemen** WhatsApp/SMS gider (kurye adı ve telefonu, tür, not, Google Haritalar konum bağlantısı, elindeki iş). Panelin her sayfasının üstünde kırmızı bant çıkar: *Konumu aç*, *Kuryeyi ara*, *Gördüm*, *Kapat…* (ne yapıldığı yazılır). Kurye "Gördüm"ü uygulamada görür.
- **Tekrar**: görülmeyen alarm 5 dakikada bir, en fazla 3 kez yeniden gönderilir (§6 `otomatik-dagitim`). Kayıtlar panel → Kuryeler → *Acil durum kayıtları*.
- **Kurulum**: `sos` Edge Function'ını yükleyin (`pnpm deploy:functions`); `ADMIN_ALERT_PHONES` boşsa alarm kimseye gitmez (Canlıya hazırlık kartı "eksik" gösterir). İş kazası halinde SGK'ya 3 iş günü içinde iş kazası bildirimi yapılması gerekir; kayıt bunun için tarih ve konum sağlar.

## 33. Teslim edilemedi → göndericiye iade

- **Kurye**: teslim adresinde *Teslim edilemedi* → neden (alıcıya ulaşılamadı, adres bulunamadı, alıcı teslim almadı, iş yeri kapalı, diğer), alıcıyı arama, **adres fotoğrafı (zorunlu)**, not. Alıcıya ulaşılamadı / kapalı / diğer nedenlerinde kurye teslim adresine vardığını bildirmiş (§30) ve en az *Teslim edilemedi için en az bekleme* (varsayılan 10 dk) beklemiş olmalı; "alıcıya ulaşılamadı"da en az bir arama şart. Sipariş **Göndericiye dönüyor** olur; kurye paketi alış adresine götürüp fotoğraf/imzayla *Göndericiye teslim eder* → **Göndericiye iade edildi**.
- **Ücret**: dönüş ayağı kuralı — gidişin ek ücretler dahil taşıma bedelinin %50'si (`return_leg_discount_pct`), satır "Teslim edilemedi – göndericiye iade". Gidiş-dönüş siparişte dönüş zaten alındığı için ek ücret yok. Dönüşte ücretli köprü yönüne (Anadolu→Avrupa) geçiliyorsa köprü eklenir. Kurumsal indirime tabidir; kurye dönüş km'si için de hakediş alır. İade edilen iş faturalanır (bireyselde hemen, kurumsalda ay sonu).
- **Bildirim**: müşteriye neden ve iade bilgisi (WhatsApp şablonu `teslim_edilemedi`, yoksa SMS), alıcıya SMS, yöneticiye uyarı; iade tamamlanınca müşteriye "geri teslim edildi".
- **Panel**: sipariş detayında *Teslim edilemedi* kartı (neden, arama sayısı, adres fotoğrafı, iade kanıtı). Yönetici yolda/sorunlu siparişte *Göndericiye iade başlat* diyebilir (kanıt şartı yok). Raporlarda "iade" sayısı; ciroya dahildir.
- **Kurumsal API**: `status` `geri_donuyor` / `geri_teslim`, `failedReason`, `returnedAt` alanları; webhook olayları aynı.

## 34. Durak sırası

- Kurye elinde birden fazla iş varken İşlerim ekranında **Durak sırası** kartı çıkar: alış, teslim ve iade durakları önerilen sırayla, her birine tahmini varış dakikasıyla. Kural: bir işin alışı teslimden önce gelir; acil işin taahhüdü kaçacaksa uzak da olsa önce gidilir (packages/shared/route.ts `planStops`, 8 durağa kadar en iyi sıralama).
- *Sıradakine git* telefonun haritasında ilk durağı, *Tüm rota* Google Haritalar'da tüm durakları sırayla açar. Kart, sıra bir acil taahhüdü kaçıracaksa uyarır.
- Panel → Canlı harita'da her kuryenin *Sıradaki* durağı görünür.
- Sıra öneridir; kurye istediği işi açıp ilerleyebilir. Otomatik atama kurye başına en fazla iş sayısını (Otomasyon → *Kurye başına en fazla aktif iş*) aşmaz.
