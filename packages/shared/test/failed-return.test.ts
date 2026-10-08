import { describe, expect, it } from "vitest";
import { courierEarning } from "../cost.ts";
import {
  DEFAULT_PRICING_SETTINGS as T,
  FAILED_RETURN_BRIDGE_LABEL,
  applyFailedDeliveryReturn,
  applyWaitingFee,
  calculatePrice,
  discountableKurus,
} from "../pricing.ts";

const WED = new Date("2026-10-07T11:00:00+03:00");
const line = (q: { lines: { code: string; amountKurus: number }[] }, code: string) =>
  q.lines.filter((l) => l.code === code).reduce((s, l) => s + l.amountKurus, 0);

describe("teslim edilemedi → göndericiye iade ücreti", () => {
  it("gidişin ek ücretler dahil taşıma bedelinin %50'si; köprü, sigorta, ağır paket tekrar alınmaz", () => {
    // 8 km acil, 12 kg, köprü: 350 + 5×25 = 475; acil +%50 = 237,50 → taşıma 712,50 TL → iade 356,25 TL
    const q = calculatePrice({ distanceMeters: 8000, serviceLevel: "acil", weightKg: 12, bridgeCrossings: 1, pickupAt: WED }, T);
    const r = applyFailedDeliveryReturn(q, { roundTrip: false }, T);
    expect(line(r, "failed_return")).toBe(35_625);
    expect(line(r, "bridge")).toBe(line(q, "bridge"));
    expect(line(r, "heavy")).toBe(line(q, "heavy"));
    expect(r.subtotalKurus).toBe(q.subtotalKurus + 35_625);
    expect(r.totalKurus).toBe(r.subtotalKurus + r.vatKurus);
    // Kurumsal indirime tabidir (taşıma bedeli)
    expect(discountableKurus(r)).toBe(discountableKurus(q) + 35_625);
  });

  it("tekrar uygulanınca değişmez; bekleme ile birlikte çalışır", () => {
    const q = applyWaitingFee(calculatePrice({ distanceMeters: 5000, pickupAt: WED }, T), 30, T);
    const once = applyFailedDeliveryReturn(q, { roundTrip: false, extraBridgeCrossings: 1 }, T);
    const twice = applyFailedDeliveryReturn(once, { roundTrip: false, extraBridgeCrossings: 1 }, T);
    expect(twice).toEqual(once);
    expect(once.lines.filter((l) => l.label === FAILED_RETURN_BRIDGE_LABEL)).toHaveLength(1);
    // Bekleme yeniden uygulansa da iade satırı kalır
    const again = applyWaitingFee(once, 30, T);
    expect(line(again, "failed_return")).toBe(line(once, "failed_return"));
  });

  it("gidiş-dönüş siparişte dönüş ayağı zaten alınmıştır: ek ücret yok", () => {
    const q = calculatePrice({ distanceMeters: 6000, roundTrip: true, pickupAt: WED }, T);
    const r = applyFailedDeliveryReturn(q, { roundTrip: true }, T);
    expect(line(r, "failed_return")).toBe(0);
    expect(r.totalKurus).toBe(q.totalKurus);
  });

  it("kurye dönüş km'si için de ödeme alır", () => {
    const q = calculatePrice({ distanceMeters: 8000, pickupAt: WED }, T);
    const before = courierEarning(q);
    const after = courierEarning(applyFailedDeliveryReturn(q, { roundTrip: false }, T));
    expect(after.km).toBe(before.km + 8);
  });
});
