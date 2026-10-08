/**
 * Sipariş olaylarından bildirim mesajları üretir (saf fonksiyon).
 * Kanal seçimi: mesaj, tercih sırasına göre kanallar listesi taşır; gönderici
 * alıcıda/ortamda mevcut ilk kanalı kullanır (ör. push token yoksa SMS).
 * Tüm mesajlar bilgilendirme amaçlıdır (İYS ticari ileti onayı gerektirmez).
 */
import { BRAND } from "./brand.ts";
import { FAILED_DELIVERY_REASONS, type FailedDeliveryReason, type OrderStatus } from "./orders.ts";

export type Channel = "push" | "whatsapp" | "sms";

export interface Recipient {
  role: "customer" | "courier" | "receiver" | "sender" | "admin";
  phone?: string | null;
  pushToken?: string | null;
}

export interface OutboundMessage {
  to: Recipient;
  channels: Channel[];
  title: string;
  text: string;
  /** WhatsApp Business onaylı şablon adı ve parametreleri */
  whatsappTemplate?: { name: string; params: string[] };
}

export interface NotificationOrder {
  orderNo: string;
  status: OrderStatus;
  urgent: boolean;
  trackingToken: string;
  pickupAddress: string;
  dropoffAddress: string;
  /** Alış adresindeki yetkili (göndereni müşteriden farklı olabilir) */
  pickupContactName?: string | null;
  pickupContactPhone?: string | null;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
  podReceiverName: string | null;
  cancelReason: string | null;
  problemNote: string | null;
  /** Teslim edilemedi nedeni ve iade teslim alan */
  failedReason?: FailedDeliveryReason | null;
  returnReceiverName?: string | null;
  /** Teslim kodu istenen siparişte alıcıya gönderilen 4 haneli kod */
  deliveryCode?: string | null;
  /**
   * Atama türü: "offer" = kurye henüz kabul etmedi (yalnız kuryeye teklif bildirimi),
   * "accepted" = teklif kabul edildi (yalnız müşteriye), "direct" = yönetici ataması (ikisine de)
   */
  assignment?: "offer" | "accepted" | "direct";
  customer: { fullName: string | null; phone: string | null; pushToken: string | null };
  courier: { fullName: string | null; phone: string | null; pushToken: string | null } | null;
}

export interface NotificationConfig {
  trackingBaseUrl: string;
  adminPhones: string[];
}

const short = (address: string) => address.split(",").slice(-1)[0]!.trim().replace(/\/İstanbul$/i, "");
const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "";

export function trackingUrl(cfg: NotificationConfig, token: string) {
  return `${cfg.trackingBaseUrl.replace(/\/$/, "")}/${token}`;
}

export function buildNotifications(event: OrderStatus, o: NotificationOrder, cfg: NotificationConfig): OutboundMessage[] {
  const url = trackingUrl(cfg, o.trackingToken);
  const customer: Recipient = { role: "customer", phone: o.customer.phone, pushToken: o.customer.pushToken };
  const courier: Recipient | null = o.courier
    ? { role: "courier", phone: o.courier.phone, pushToken: o.courier.pushToken }
    : null;
  const route = `${short(o.pickupAddress)} → ${short(o.dropoffAddress)}`;
  const admins = (title: string, text: string): OutboundMessage[] =>
    cfg.adminPhones.map((phone) => ({
      to: { role: "admin", phone },
      channels: ["whatsapp", "sms"],
      title,
      text,
      whatsappTemplate: { name: "yonetici_uyari", params: [text] },
    }));
  const out: OutboundMessage[] = [];

  switch (event) {
    case "beklemede":
      out.push({
        to: customer,
        channels: ["push", "sms"],
        title: "Siparişiniz alındı",
        text: `${BRAND.name}: ${o.orderNo} siparişiniz alındı. Takip: ${url}`,
        whatsappTemplate: { name: "siparis_alindi", params: [o.orderNo, url] },
      });
      out.push(...admins("Yeni sipariş", `Yeni sipariş ${o.orderNo}${o.urgent ? " (ACİL)" : ""}: ${route}`));
      break;
    case "kuryeye_atandi": {
      // Bildirim gönderilene kadar teklif reddedilmiş/iş geri alınmış olabilir
      if (o.status === "onaylandi" || o.status === "iptal" || o.status === "beklemede") break;
      const assignment = o.assignment ?? "direct";
      if (courier && assignment !== "accepted") {
        out.push(
          assignment === "offer"
            ? {
                to: courier,
                channels: ["push", "sms"],
                title: o.urgent ? "⚡ ACİL iş teklifi" : "🔔 Yeni iş teklifi",
                text: `${o.orderNo}: ${route}. Uygulamayı açıp kabul edin; süre dolarsa iş başka kuryeye geçer.`,
              }
            : { to: courier, channels: ["push", "sms"], title: o.urgent ? "⚡ Yeni ACİL iş" : "Yeni iş", text: `${o.orderNo}: ${route}` },
        );
      }
      if (assignment !== "offer") {
        out.push({
          to: customer,
          channels: ["push"],
          title: "Kurye atandı",
          text: `${o.orderNo} için kuryeniz ${firstName(o.courier?.fullName) || "atandı"} yola çıkıyor.`,
        });
      }
      break;
    }
    case "alindi":
      out.push({ to: customer, channels: ["push"], title: "Paket alındı", text: `${o.orderNo} kuryemiz tarafından alındı.` });
      break;
    case "yolda":
      out.push({ to: customer, channels: ["push"], title: "Gönderiniz yolda", text: `${o.orderNo} yolda. Takip: ${url}` });
      if (o.dropoffContactPhone) {
        const name = firstName(o.dropoffContactName);
        out.push({
          to: { role: "receiver", phone: o.dropoffContactPhone },
          channels: ["whatsapp", "sms"],
          title: "Gönderiniz yolda",
          text:
            `${name ? `Merhaba ${name}, ` : ""}size gönderilen paket ${BRAND.name} ile yola çıktı.` +
            (o.deliveryCode ? ` Teslim kodunuz: ${o.deliveryCode} (paketi alırken kuryeye söyleyin).` : "") +
            ` Canlı takip: ${url}`,
          whatsappTemplate: o.deliveryCode
            ? { name: "alici_gonderi_yolda_kod", params: [name || "Sayın alıcı", o.deliveryCode, url] }
            : { name: "alici_gonderi_yolda", params: [name || "Sayın alıcı", url] },
        });
      }
      break;
    case "teslim_edildi":
      out.push({
        to: customer,
        channels: ["push", "sms"],
        title: "Teslim edildi",
        text: `${BRAND.name}: ${o.orderNo} teslim edildi${o.podReceiverName ? ` (teslim alan: ${o.podReceiverName})` : ""}. Teşekkürler! Hizmetimizi puanlayın: ${url}`,
        whatsappTemplate: { name: "teslim_edildi", params: [o.orderNo, o.podReceiverName ?? "-"] },
      });
      break;
    case "iptal":
      out.push({
        to: customer,
        channels: ["push", "sms"],
        title: "Sipariş iptal edildi",
        text: `${BRAND.name}: ${o.orderNo} iptal edildi.${o.cancelReason ? ` Neden: ${o.cancelReason}` : ""}`,
      });
      if (courier) out.push({ to: courier, channels: ["push", "sms"], title: "İş iptal edildi", text: `${o.orderNo} iptal edildi.` });
      break;
    case "sorunlu":
      out.push(...admins("Sorunlu sipariş", `SORUN ${o.orderNo}: ${o.problemNote ?? "açıklama yok"}`));
      out.push({
        to: customer,
        channels: ["push"],
        title: "Siparişinizle ilgili bilgi",
        text: `${o.orderNo} ile ilgili bir aksaklık var; ekibimiz sizinle iletişime geçecek.`,
      });
      break;
    case "geri_donuyor": {
      const reason = o.failedReason ? FAILED_DELIVERY_REASONS[o.failedReason].toLocaleLowerCase("tr-TR") : "alıcıya ulaşılamadı";
      out.push({
        to: customer,
        channels: ["push", "sms"],
        title: "Teslim edilemedi",
        text: `${BRAND.name}: ${o.orderNo} teslim edilemedi (${reason}). Paket size geri getiriliyor; dönüş ayağı ücreti eklenir. Takip: ${url}`,
        whatsappTemplate: { name: "teslim_edilemedi", params: [o.orderNo, reason, url] },
      });
      if (o.dropoffContactPhone) {
        const name = firstName(o.dropoffContactName);
        out.push({
          to: { role: "receiver", phone: o.dropoffContactPhone },
          channels: ["sms"],
          title: "Gönderi iade ediliyor",
          text: `${name ? `Merhaba ${name}, ` : ""}size gönderilen paket teslim alınamadığı için göndericiye iade ediliyor (${BRAND.name}).`,
        });
      }
      out.push(...admins("Teslim edilemedi", `TESLİM EDİLEMEDİ ${o.orderNo}: ${reason}. Paket göndericiye dönüyor.`));
      break;
    }
    case "geri_teslim":
      out.push({
        to: customer,
        channels: ["push", "sms"],
        title: "Paket size geri teslim edildi",
        text: `${BRAND.name}: ${o.orderNo} paketi size geri teslim edildi${o.returnReceiverName ? ` (teslim alan: ${o.returnReceiverName})` : ""}.`,
      });
      break;
    case "onaylandi":
      break;
  }
  // Ulaşılabilir kanalı olmayan alıcıları ele
  return out.filter((m) => (m.to.pushToken && m.channels.includes("push")) || (m.to.phone && m.channels.some((c) => c !== "push")));
}

/** Durum değişikliği dışındaki sipariş olayları (notifications.kind) */
export type NotificationKind = "varis_alis" | "varis_teslim";

const digits = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

/** Olay bildirimleri: kurye alış / teslim adresine vardı */
export function buildEventNotifications(kind: NotificationKind, o: NotificationOrder, cfg: NotificationConfig): OutboundMessage[] {
  const customer: Recipient = { role: "customer", phone: o.customer.phone, pushToken: o.customer.pushToken };
  const courierName = firstName(o.courier?.fullName) || "Kuryemiz";
  const out: OutboundMessage[] = [];
  switch (kind) {
    case "varis_alis": {
      // Paket alındıysa artık anlamı yok
      if (o.status !== "kuryeye_atandi") break;
      const separateSender = !!o.pickupContactPhone && digits(o.pickupContactPhone) !== digits(o.customer.phone);
      if (separateSender) {
        out.push({
          to: { role: "sender", phone: o.pickupContactPhone },
          channels: ["whatsapp", "sms"],
          title: "Kurye kapıda",
          text: `${BRAND.name}: ${courierName} ${o.orderNo} için alış adresinizde. Paketi hazırlayabilirsiniz.`,
          whatsappTemplate: { name: "kurye_alista", params: [courierName, o.orderNo] },
        });
      }
      out.push({
        to: customer,
        channels: separateSender ? ["push"] : ["push", "sms"],
        title: "Kurye alış adresinde",
        text: `${BRAND.name}: ${courierName} ${o.orderNo} için alış adresinde. Paketi hazırlayabilirsiniz.`,
      });
      break;
    }
    case "varis_teslim": {
      if (o.status === "teslim_edildi" || o.status === "iptal") break;
      if (o.dropoffContactPhone) {
        const name = firstName(o.dropoffContactName);
        out.push({
          to: { role: "receiver", phone: o.dropoffContactPhone },
          channels: ["whatsapp", "sms"],
          title: "Kurye kapıda",
          text:
            `${name ? `Merhaba ${name}, ` : ""}${BRAND.name} kuryesi ${courierName} adresinizde; paketinizi teslim almak için hazır olun.` +
            (o.deliveryCode ? ` Teslim kodunuz: ${o.deliveryCode}.` : ""),
          whatsappTemplate: o.deliveryCode
            ? { name: "alici_kurye_kapida_kod", params: [name || "Sayın alıcı", courierName, o.deliveryCode] }
            : { name: "alici_kurye_kapida", params: [name || "Sayın alıcı", courierName] },
        });
      }
      out.push({ to: customer, channels: ["push"], title: "Kurye teslim adresinde", text: `${o.orderNo}: kurye teslim adresine ulaştı.` });
      break;
    }
  }
  void cfg;
  return out.filter((m) => (m.to.pushToken && m.channels.includes("push")) || (m.to.phone && m.channels.some((c) => c !== "push")));
}
