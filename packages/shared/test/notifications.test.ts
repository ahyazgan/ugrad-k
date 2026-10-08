import { describe, expect, it } from "vitest";
import { buildNotifications, type NotificationOrder } from "../notifications.ts";

const cfg = { trackingBaseUrl: "https://panel.yazgankurye.com/takip/", adminPhones: ["+905550000001"] };
const order: NotificationOrder = {
  orderNo: "YK-1001",
  status: "beklemede",
  urgent: true,
  trackingToken: "abc",
  pickupAddress: "Kılıçlı Mah., Beykoz/İstanbul",
  dropoffAddress: "Levent Mah., Beşiktaş/İstanbul",
  dropoffContactName: "Ali Veli",
  dropoffContactPhone: "+905334445566",
  podReceiverName: "Resepsiyon",
  cancelReason: null,
  problemNote: "Alıcıya ulaşılamıyor",
  customer: { fullName: "Ayşe", phone: "+905321112233", pushToken: null },
  courier: { fullName: "Mehmet Kaya", phone: "+905551110001", pushToken: "ExponentPushToken[x]" },
};

describe("buildNotifications", () => {
  it("yeni sipariş: müşteriye takip linki, yöneticiye uyarı", () => {
    const m = buildNotifications("beklemede", order, cfg);
    expect(m).toHaveLength(2);
    expect(m[0]!.text).toContain("https://panel.yazgankurye.com/takip/abc");
    expect(m[0]!.channels).toEqual(["push", "sms"]);
    expect(m[1]!.to.role).toBe("admin");
    expect(m[1]!.text).toContain("ACİL");
    expect(m[1]!.text).toContain("Beykoz → Beşiktaş");
  });

  it("kurye atandı: kuryeye push, müşteriye push yoksa gönderilmez", () => {
    const assigned = { ...order, status: "kuryeye_atandi" as const };
    const m = buildNotifications("kuryeye_atandi", assigned, cfg);
    expect(m.map((x) => x.to.role)).toEqual(["courier"]);
    expect(m[0]!.title).toContain("ACİL");
    const withPush = buildNotifications("kuryeye_atandi", { ...assigned, customer: { ...order.customer, pushToken: "t" } }, cfg);
    expect(withPush.find((x) => x.to.role === "customer")!.text).toContain("Mehmet");
  });

  it("iş teklifi: yalnız kuryeye teklif; kabulden sonra yalnız müşteriye", () => {
    const base = { ...order, status: "kuryeye_atandi" as const, customer: { ...order.customer, pushToken: "t" } };
    const offer = buildNotifications("kuryeye_atandi", { ...base, assignment: "offer" }, cfg);
    expect(offer.map((x) => x.to.role)).toEqual(["courier"]);
    expect(offer[0]!.title).toBe("⚡ ACİL iş teklifi");
    expect(offer[0]!.text).toContain("kabul edin");
    const accepted = buildNotifications("kuryeye_atandi", { ...base, assignment: "accepted" }, cfg);
    expect(accepted.map((x) => x.to.role)).toEqual(["customer"]);
    // Bildirim gönderilmeden teklif reddedilip iş havuza döndüyse kimseye gitmez
    expect(buildNotifications("kuryeye_atandi", { ...base, status: "onaylandi", assignment: "offer" }, cfg)).toEqual([]);
  });

  it("yolda: alıcıya WhatsApp/SMS takip linki", () => {
    const m = buildNotifications("yolda", order, cfg);
    const r = m.find((x) => x.to.role === "receiver")!;
    expect(r.channels).toEqual(["whatsapp", "sms"]);
    expect(r.text).toMatch(/^Merhaba Ali,/);
    expect(r.whatsappTemplate).toEqual({ name: "alici_gonderi_yolda", params: ["Ali", "https://panel.yazgankurye.com/takip/abc"] });
  });

  it("yolda: teslim kodu istenen siparişte kod alıcıya gider", () => {
    const r = buildNotifications("yolda", { ...order, deliveryCode: "4821" }, cfg).find((x) => x.to.role === "receiver")!;
    expect(r.text).toContain("Teslim kodunuz: 4821");
    expect(r.whatsappTemplate).toEqual({ name: "alici_gonderi_yolda_kod", params: ["Ali", "4821", "https://panel.yazgankurye.com/takip/abc"] });
  });

  it("alıcı telefonu yoksa alıcıya mesaj yok", () => {
    const m = buildNotifications("yolda", { ...order, dropoffContactPhone: null }, cfg);
    expect(m.some((x) => x.to.role === "receiver")).toBe(false);
  });

  it("teslim: teslim alan adı", () => {
    expect(buildNotifications("teslim_edildi", order, cfg)[0]!.text).toContain("teslim alan: Resepsiyon");
  });

  it("sorunlu: yöneticiye not ile", () => {
    const m = buildNotifications("sorunlu", order, cfg);
    expect(m[0]!.text).toBe("SORUN YK-1001: Alıcıya ulaşılamıyor");
  });

  it("onaylandı: bildirim yok", () => {
    expect(buildNotifications("onaylandi", order, cfg)).toEqual([]);
  });

  it("SMS metinleri makul uzunlukta (≤ 2 SMS)", () => {
    for (const ev of ["beklemede", "yolda", "teslim_edildi", "iptal"] as const) {
      for (const msg of buildNotifications(ev, { ...order, cancelReason: "Müşteri vazgeçti" }, cfg)) {
        if (msg.channels.includes("sms")) expect(msg.text.length).toBeLessThanOrEqual(268);
      }
    }
  });
});
