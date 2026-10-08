import { describe, expect, it } from "vitest";
import { courierBalance, courierEarning, DEFAULT_COST_MODEL, estimateJobCost, indexPricingSettings, roundPrice } from "../cost.ts";
import { applyWaitingFee, calculatePrice, DEFAULT_PRICING_SETTINGS as S } from "../pricing.ts";

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

describe("courierEarning", () => {
  it("iş + km + prim + bekleme payı + köprü iadesi", () => {
    const q = applyWaitingFee(
      calculatePrice({ distanceMeters: 12_000, serviceLevel: "acil", bridgeCrossings: 1, pickupAt: NIGHT }, S),
      32,
      S,
    );
    const e = courierEarning(q);
    expect(e.km).toBe(12);
    expect(e.jobKurus).toBe(15_000);
    expect(e.kmKurus).toBe(14_400);
    expect(e.bonusPct).toBe(60);
    expect(e.bonusKurus).toBe(Math.round(29_400 * 0.6));
    expect(e.waitingKurus).toBe(5_000); // 2 dilim × 50 TL'nin yarısı
    expect(e.bridgeKurus).toBe(2_500);
    expect(e.totalKurus).toBe(15_000 + 14_400 + 17_640 + 5_000 + 2_500);
  });

  it("uzak alış km'si ödenir; eski tekliflerde eksik meta varsayılanla", () => {
    const far = calculatePrice({ distanceMeters: 8_000, pickupPoint: { lat: 40.816, lng: 29.3 }, pickupAt: WED }, S);
    const extra = Math.ceil(far.meta.pickupFromCenterKm! - S.freePickupRadiusKm);
    expect(courierEarning(far).km).toBe(8 + extra);
    const legacy = { lines: [], meta: { distanceKm: 5, returnDistanceKm: null, nightOrHoliday: false, holidayName: null, surchargePct: 0 } };
    expect(courierEarning(legacy).totalKurus).toBe(15_000 + 5 * 1_200);
  });

  it("bakiye: hakediş − elde tutulan nakit", () => {
    expect(courierBalance([{ totalKurus: 21_000, cashCollectedKurus: 48_000 }, { totalKurus: 30_000, cashCollectedKurus: 0 }])).toEqual({
      deliveries: 2,
      earningsKurus: 51_000,
      cashKurus: 48_000,
      incentiveKurus: 0,
      netKurus: 3_000,
    });
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
