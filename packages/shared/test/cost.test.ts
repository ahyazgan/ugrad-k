import { describe, expect, it } from "vitest";
import { DEFAULT_COST_MODEL, estimateJobCost, indexPricingSettings, roundPrice } from "../cost.ts";
import { calculatePrice, DEFAULT_PRICING_SETTINGS as S } from "../pricing.ts";

const WED = new Date("2026-10-07T08:00:00Z"); // Çarşamba 11:00 İstanbul
const NIGHT = new Date("2026-10-07T20:30:00Z"); // 23:30

describe("estimateJobCost", () => {
  it("5 km standart: kurye 150 + 5×12, genel gider 30", () => {
    const q = calculatePrice({ distanceMeters: 5_000, pickupAt: WED }, S);
    const c = estimateJobCost(q);
    expect(c.courierKurus).toBe(21_000);
    expect(c.totalKurus).toBe(24_000);
    expect(c.marginKurus).toBe(q.subtotalKurus - 24_000);
    expect(c.marginPct).toBeCloseTo((c.marginKurus / q.subtotalKurus) * 100, 1);
  });

  it("acil + gece kurye primi, köprü aynen geçer, kart komisyonu", () => {
    const q = calculatePrice({ distanceMeters: 12_000, serviceLevel: "acil", bridgeCrossings: 1, pickupAt: NIGHT }, S);
    const c = estimateJobCost(q, DEFAULT_COST_MODEL, { card: true });
    const base = 15_000 + 12 * 1_200;
    expect(c.courierKurus).toBe(base + Math.round(base * 0.6));
    expect(c.passThroughKurus).toBe(2_500);
    expect(c.paymentFeeKurus).toBe(Math.round(q.totalKurus * 0.025));
  });

  it("ekonomi işte iş başı ödeme düşer, gidiş-dönüş km'si eklenir", () => {
    const eco = estimateJobCost(calculatePrice({ distanceMeters: 5_000, serviceLevel: "ekonomi", pickupAt: WED }, S));
    expect(eco.courierKurus).toBe(9_000 + 5 * 1_200);
    const rt = estimateJobCost(calculatePrice({ distanceMeters: 5_000, returnDistanceMeters: 6_000, roundTrip: true, pickupAt: WED }, S));
    expect(rt.courierKurus).toBe(15_000 + 11 * 1_200);
  });

  it("varsayılan tarifede tipik işler kârlı", () => {
    for (const [m, level] of [[5_000, "standart"], [12_000, "acil"], [22_000, "standart"], [5_000, "ekonomi"]] as const) {
      const c = estimateJobCost(calculatePrice({ distanceMeters: m, serviceLevel: level, pickupAt: WED }, S));
      expect(c.marginPct).toBeGreaterThan(20);
    }
  });
});

describe("indexPricingSettings", () => {
  it("para alanlarını yuvarlayarak artırır, köprü ve yüzdeler sabit", () => {
    const n = indexPricingSettings(S, 10);
    expect(n.baseFeeKurus).toBe(38_500);
    expect(n.kmTiers.map((t) => t.perKmKurus)).toEqual([2_750, 2_000]);
    expect(n.waitingBlockFeeKurus).toBe(5_500);
    expect(n.bridgeFeeKurus).toBe(S.bridgeFeeKurus);
    expect(n.urgentSurchargePct).toBe(S.urgentSurchargePct);
    expect(n.kmTiers.map((t) => t.uptoKm)).toEqual(S.kmTiers.map((t) => t.uptoKm));
    expect(S.baseFeeKurus).toBe(35_000); // kaynak değişmez
  });
  it("geçersiz oran", () => {
    expect(() => indexPricingSettings(S, Number.NaN)).toThrow();
    expect(() => indexPricingSettings(S, 500)).toThrow();
  });
  it("roundPrice", () => {
    expect(roundPrice(38_420)).toBe(38_500);
    expect(roundPrice(2_730)).toBe(2_750);
    expect(roundPrice(1_980)).toBe(2_000);
  });
});
