// Marka ve alan adı — TEK KAYNAK.
// Yeni marka adı / alan adı alındığında yalnızca bu dosyayı değiştirin; web sitesi, panel,
// takip linkleri, SMS/WhatsApp metinleri, asistan ve yasal metinler buradan okur.
// (Mobil uygulamanın mağaza adı ve paket kimliği ayrıca apps/mobile/app.json içindedir — docs/kurulum.md.)

/** Kök alan adı (www olmadan) */
const DOMAIN = "yazgankurye.com";

export const BRAND = {
  /** Müşterinin gördüğü marka adı */
  name: "Yazgan Kurye",
  /** SMS başlığı gibi kısa yerler için */
  shortName: "Yazgan",
  slogan: "İstanbul'da acil evrak ve paket için moto kurye",
  domain: DOMAIN,
  /** Tanıtım sitesi (apps/web) */
  siteUrl: `https://${DOMAIN}`,
  /** Yönetim paneli + takip sayfası (apps/admin) */
  panelUrl: `https://panel.${DOMAIN}`,
  /** Tarayıcıdan sipariş (Expo web derlemesi) */
  appUrl: `https://app.${DOMAIN}`,
  /** Uygulama derin bağlantı şeması — apps/mobile/app.json "scheme" ile aynı olmalı */
  appScheme: "yazgankurye",
  email: {
    info: `info@${DOMAIN}`,
    orders: `siparis@${DOMAIN}`,
    kvkk: `kvkk@${DOMAIN}`,
    noreply: `bildirim@${DOMAIN}`,
  },
  /** Müşteri hattı (E.164). Boş bırakılırsa sitede gösterilmez. */
  phone: "" as string,
  /** WhatsApp Business numarası (E.164, + olmadan wa.me için kullanılır). Boşsa gizlenir. */
  whatsapp: "" as string,
  /** Google İşletme Profili "yorum yaz" bağlantısı (5 puan verenler yönlendirilir). Boşsa yönlendirme yapılmaz. */
  googleReviewUrl: "" as string,
  colors: { primary: "#0f3d6e", accent: "#f59e0b" },
} as const;

export const trackingBaseUrl = `${BRAND.panelUrl}/takip`;
export const kvkkUrl = `${BRAND.siteUrl}/kvkk`;
