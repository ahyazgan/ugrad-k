import { describe, expect, it } from "vitest";
import { BRAND } from "../brand.ts";
import { buildEventNotifications, buildNotifications, type NotificationOrder } from "../notifications.ts";

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

  it("alışa varış: gönderen müşteriden farklıysa ona, değilse müşteriye SMS", () => {
    const at = { ...order, status: "kuryeye_atandi" as const };
    const sep = buildEventNotifications("varis_alis", { ...at, pickupContactPhone: "+90 532 999 88 77" }, cfg);
    expect(sep.map((m) => m.to.role)).toEqual(["sender"]);
    expect(sep[0]!.text).toContain("Mehmet YK-1001 için alış adresinizde");
    const same = buildEventNotifications("varis_alis", { ...at, pickupContactPhone: "0532 111 22 33" }, cfg);
    expect(same.map((m) => `${m.to.role}:${m.channels.join("+")}`)).toEqual(["customer:push+sms"]);
    // Paket alındıktan sonra işlenen varış bildirimi gönderilmez
    expect(buildEventNotifications("varis_alis", { ...order, status: "alindi" }, cfg)).toEqual([]);
  });

  it("teslime varış: alıcıya kod ile kapıda mesajı", () => {
    const m = buildEventNotifications("varis_teslim", { ...order, status: "yolda", deliveryCode: "4821" }, cfg);
    const r = m.find((x) => x.to.role === "receiver")!;
    expect(r.text).toBe(`Merhaba Ali, ${BRAND.name} kuryesi Mehmet adresinizde; paketinizi teslim almak için hazır olun. Teslim kodunuz: 4821.`);
    expect(r.whatsappTemplate).toEqual({ name: "alici_kurye_kapida_kod", params: ["Ali", "Mehmet", "4821"] });
  });

  it("teslim edilemedi: müşteriye neden ve iade, alıcıya SMS, yöneticiye uyarı", () => {
    const m = buildNotifications("geri_donuyor", { ...order, status: "geri_donuyor", failedReason: "alici_yok" }, cfg);
    expect(m.map((x) => x.to.role)).toEqual(["customer", "receiver", "admin"]);
    expect(m[0]!.text).toContain("teslim edilemedi (alıcıya ulaşılamadı). Paket size geri getiriliyor");
    expect(m[0]!.whatsappTemplate!.name).toBe("teslim_edilemedi");
    const back = buildNotifications("geri_teslim", { ...order, status: "geri_teslim", returnReceiverName: "Ayşe" }, cfg);
    expect(back[0]!.text).toContain("geri teslim edildi (teslim alan: Ayşe)");
  });

  it("mesaj: karşı tarafa yalnız push, kısa önizleme", () => {
    const withPush = { ...order, status: "yolda" as const, customer: { ...order.customer, pushToken: "c" } };
    const toCustomer = buildEventNotifications("mesaj_musteri", { ...withPush, lastMessage: { senderRole: "kurye", body: "Kapıdayım" } }, cfg);
    expect(toCustomer).toEqual([{ to: { role: "customer", phone: "+905321112233", pushToken: "c" }, channels: ["push"], title: "Kuryeniz Mehmet · YK-1001", text: "Kapıdayım" }]);
    const toCourier = buildEventNotifications("mesaj_kurye", { ...withPush, lastMessage: { senderRole: "musteri", body: "x".repeat(300) } }, cfg);
    expect(toCourier[0]!.to.role).toBe("courier");
    expect(toCourier[0]!.text).toHaveLength(120);
    // Push token yoksa SMS'e düşmez
    expect(buildEventNotifications("mesaj_musteri", { ...order, lastMessage: { senderRole: "kurye", body: "a" } }, cfg)).toEqual([]);
  });
});
