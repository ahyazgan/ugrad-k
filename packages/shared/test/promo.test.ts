import { describe, expect, it } from "vitest";
import { applyPromo, normalizeCode, promoDiscountKurus, promoProblem, type Promo } from "../promo.ts";
import { calculatePrice, calculateMonthlyInvoice, DEFAULT_PRICING_SETTINGS as S, discountableKurus } from "../pricing.ts";

const WED = new Date("2026-10-07T08:00:00Z");
const promo = (over: Partial<Promo> = {}): Promo => ({
  code: "HOSGELDIN",
  description: null,
  kind: "yuzde",
  value: 20,
  maxDiscountKurus: null,
  minSubtotalKurus: 0,
  validFrom: null,
  validUntil: null,
  maxRedemptions: null,
  perCustomerLimit: 1,
  newCustomersOnly: false,
  customerId: null,
  active: true,
  ...over,
});
const usage = { now: WED, customerId: "u1", customerOrderCount: 0, customerRedemptions: 0, totalRedemptions: 0 };

describe("kampanya kodu", () => {
  const q = calculatePrice({ distanceMeters: 22_000, bridgeCrossings: 1, pickupAt: WED }, S); // taşıma 741 TL + köprü 25

  it("yüzde indirim taşıma bedeline, tavanlı; tutar indirim", () => {
    expect(promoDiscountKurus(promo(), q)).toBe(14_820);
    expect(promoDiscountKurus(promo({ maxDiscountKurus: 10_000 }), q)).toBe(10_000);
    expect(promoDiscountKurus(promo({ kind: "tutar", value: 5_000 }), q)).toBe(5_000);
    expect(promoDiscountKurus(promo({ kind: "tutar", value: 9_999_999 }), q)).toBe(74_100);
  });

  it("uygulanınca KDV yeniden hesaplanır, kurumsal indirim tabanı düşer (çift indirim yok)", () => {
    const p = applyPromo(q, "Kampanya HOSGELDIN (%20)", 14_820);
    expect(p.subtotalKurus).toBe(q.subtotalKurus - 14_820);
    expect(p.vatKurus).toBe(Math.round(p.subtotalKurus * 0.2));
    expect(discountableKurus(p)).toBe(74_100 - 14_820);
    const inv = calculateMonthlyInvoice([{ subtotalKurus: p.subtotalKurus, discountableKurus: discountableKurus(p) }], { ...S, corporateTiers: [{ minDeliveries: 1, discountPct: 10 }] });
    expect(inv.discountKurus).toBe(Math.round((74_100 - 14_820) * 0.1));
  });

  it("geçerlilik kuralları", () => {
    expect(promoProblem(promo(), q, usage)).toBeNull();
    expect(promoProblem(promo({ active: false }), q, usage)).toBe("Bu kampanya sona erdi");
    expect(promoProblem(promo({ validUntil: "2026-10-01T00:00:00Z" }), q, usage)).toBe("Kampanyanın süresi doldu");
    expect(promoProblem(promo({ validFrom: "2026-11-01T00:00:00Z" }), q, usage)).toBe("Kampanya henüz başlamadı");
    expect(promoProblem(promo({ maxRedemptions: 5 }), q, { ...usage, totalRedemptions: 5 })).toBe("Kampanya kullanım sınırına ulaştı");
    expect(promoProblem(promo(), q, { ...usage, customerRedemptions: 1 })).toBe("Bu kodu daha önce kullandınız");
    expect(promoProblem(promo({ newCustomersOnly: true }), q, { ...usage, customerOrderCount: 2 })).toBe("Bu kod yalnız ilk siparişte geçerli");
    expect(promoProblem(promo({ customerId: "u2" }), q, usage)).toBe("Bu kod size ait değil");
    expect(promoProblem(promo({ minSubtotalKurus: 1_000_000 }), q, usage)).toMatch(/10\.000,00 TL ve üzeri/);
    expect(normalizeCode(" hoş geldin ")).toBe("HOŞGELDIN");
  });
});
