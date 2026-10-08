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

-- Ödeme süresi dolan kart siparişlerini iptal et (süre: panel → Operasyon ayarları)
select cron.schedule('odenmemis-kart-iptal', '*/5 * * * *', 'select public.cancel_unpaid_card_orders()');
```

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
   | `teslim_edildi` | `{{1}} numaralı gönderi teslim edildi. Teslim alan: {{2}}` |
   | `yonetici_uyari` | `Yazgan Kurye uyarı: {{1}}` |

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
| Vercel (panel) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | |
| EAS (mobil) | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_TRACKING_BASE_URL` | |
| `app.json` | `expo.extra.eas.projectId` | Push bildirimleri |

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` Edge Function'lara Supabase tarafından otomatik verilir.
