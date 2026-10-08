import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING_SETTINGS as T,
  PricingError,
  calculateMonthlyInvoice,
  calculatePrice,
  discountableKurus,
  economyAvailableAt,
  remotePickupFee,
  timeSurchargeAt,
  type Holiday,
} from "../pricing.ts";

const ist = (isoLocal: string) => new Date(`${isoLocal}+03:00`);
const WED = ist("2026-10-07T11:00:00"); // Çarşamba sabah
const holidays: Holiday[] = [{ date: "2026-10-29", name: "Cumhuriyet Bayramı", halfDay: false }];
const line = (q: ReturnType<typeof calculatePrice>, code: string) => q.lines.find((l) => l.code === code)?.amountKurus;

describe("v2: hizmet seviyeleri", () => {
  it("ekonomi taşıma bedelinde %25 indirim", () => {
    // 5 km: 350 + 2×25 = 400 TL → ekonomi −100 TL
    const q = calculatePrice({ distanceMeters: 5000, serviceLevel: "ekonomi", pickupAt: WED }, T);
    expect(line(q, "economy")).toBe(-10_000);
    expect(q.subtotalKurus).toBe(30_000);
    expect(q.meta.serviceLevel).toBe("ekonomi");
  });

  it("ekonomi yalnız Pzt–Cmt 07–14 arası", () => {
    expect(economyAvailableAt(ist("2026-10-07T13:59:00"), T)).toBe(true);
    expect(economyAvailableAt(ist("2026-10-07T14:00:00"), T)).toBe(false);
    expect(economyAvailableAt(ist("2026-10-07T06:30:00"), T)).toBe(false); // gece
    expect(economyAvailableAt(ist("2026-10-11T10:00:00"), T)).toBe(false); // Pazar
    expect(economyAvailableAt(ist("2026-10-10T10:00:00"), T)).toBe(true); // Cumartesi
    expect(economyAvailableAt(ist("2026-10-29T10:00:00"), T, holidays)).toBe(false);
    expect(() => calculatePrice({ distanceMeters: 5000, serviceLevel: "ekonomi", pickupAt: ist("2026-10-07T16:00:00") }, T)).toThrow(PricingError);
  });

  it("eski urgent:true = acil", () => {
    const a = calculatePrice({ distanceMeters: 12_000, urgent: true, pickupAt: WED }, T);
    const b = calculatePrice({ distanceMeters: 12_000, serviceLevel: "acil", pickupAt: WED }, T);
    expect(a.subtotalKurus).toBe(b.subtotalKurus);
    expect(b.meta.serviceLevel).toBe("acil");
  });
});

describe("v2: zaman ekleri (gece, Pazar, tatil) toplanmaz", () => {
  it("Pazar gündüz +%50, Pazar gecesi yine tek ek", () => {
    expect(timeSurchargeAt(ist("2026-10-11T12:00:00"), T)).toMatchObject({ kind: "sunday", pct: 50 });
    expect(timeSurchargeAt(ist("2026-10-11T23:00:00"), T).pct).toBe(50);
    const q = calculatePrice({ distanceMeters: 5000, pickupAt: ist("2026-10-11T12:00:00") }, T);
    expect(q.lines.find((l) => l.code === "night_holiday")!.label).toContain("Pazar");
    expect(q.subtotalKurus).toBe(60_000);
  });

  it("farklı oranlarda en yüksek olan uygulanır", () => {
    const s = { ...T, nightSurchargePct: 30, sundaySurchargePct: 40, nightHolidaySurchargePct: 50 };
    expect(timeSurchargeAt(ist("2026-10-07T23:00:00"), s)).toMatchObject({ kind: "night", pct: 30 });
    expect(timeSurchargeAt(ist("2026-10-11T23:00:00"), s)).toMatchObject({ kind: "sunday", pct: 40 });
    expect(timeSurchargeAt(ist("2026-10-29T23:00:00"), s, holidays)).toMatchObject({ kind: "holiday", pct: 50 });
    // Gece oranı Pazar'dan yüksekse gece adı ve oranı
    expect(timeSurchargeAt(ist("2026-10-11T23:00:00"), { ...s, nightSurchargePct: 60 })).toMatchObject({ kind: "night", pct: 60 });
  });

  it("acil + zaman eki tavanı korunur", () => {
    const q = calculatePrice({ distanceMeters: 5000, serviceLevel: "acil", pickupAt: ist("2026-10-11T12:00:00") }, T);
    expect(q.meta.surchargePct).toBe(75);
  });
});

describe("v2: uzak alış ve ağırlık", () => {
  it("merkezden 40 km'ye kadar ücretsiz, sonrası km başı ve tavanlı", () => {
    expect(remotePickupFee({ lat: 40.9877, lng: 29.0275 }, T).feeKurus).toBe(0); // Kadıköy
    expect(remotePickupFee({ lat: 40.8886, lng: 29.1856 }, T).feeKurus).toBe(0); // Kartal (Anadolu Adliyesi)
    const far = remotePickupFee({ lat: 41.03, lng: 28.67 }, T); // Esenyurt
    expect(far.km).toBeGreaterThan(40);
    expect(far.feeKurus).toBeGreaterThan(0);
    expect(far.feeKurus).toBe(far.billableKm * 1_000);
    const veryFar = remotePickupFee({ lat: 41.074, lng: 28.246 }, T); // Silivri
    expect(veryFar.feeKurus).toBe(30_000);
    const q = calculatePrice({ distanceMeters: 5000, pickupAt: WED, pickupPoint: { lat: 41.03, lng: 28.67 } }, T);
    expect(line(q, "remote_pickup")).toBe(far.feeKurus);
    expect(q.meta.pickupFromCenterKm).toBe(far.km);
  });

  it("20 kg üzeri reddedilir", () => {
    expect(() => calculatePrice({ distanceMeters: 5000, weightKg: 21, pickupAt: WED }, T)).toThrow("20 kg üzeri");
    expect(() => calculatePrice({ distanceMeters: 5000, weightKg: 21, pickupAt: WED }, { ...T, maxWeightKg: null })).not.toThrow();
  });
});

describe("v2: kurumsal indirim yalnız taşıma bedeline", () => {
  it("köprü, bekleme, ağır paket ve uzak alış indirimsiz", () => {
    const q = calculatePrice(
      { distanceMeters: 22_000, bridgeCrossings: 1, largePackage: true, waitingMinutes: 30, pickupAt: WED },
      T,
    );
    // taşıma: 350 + 7×25 + 12×18 = 741 TL; indirimsiz: köprü 25 + ağır 150 + bekleme 100
    expect(discountableKurus(q)).toBe(74_100);
    const inv = calculateMonthlyInvoice(
      Array.from({ length: 20 }, () => ({ subtotalKurus: q.subtotalKurus, discountableKurus: discountableKurus(q) })),
      T,
    );
    expect(inv.discountPct).toBe(15);
    expect(inv.discountKurus).toBe(Math.round(74_100 * 20 * 0.15));
    // Eski çağrı biçimi (sayılar) aynen çalışır
    expect(calculateMonthlyInvoice([40_000, 40_000], T).discountKurus).toBe(0);
  });
});

describe("değer beyanı sigortası", () => {
  it("1.000 TL'ye kadar ücretsiz, üstü %0,5 (en az 25 TL), sınır üstü reddedilir", async () => {
    const { insuranceFeeKurus } = await import("../pricing.ts");
    expect(insuranceFeeKurus(null, T)).toBe(0);
    expect(insuranceFeeKurus(100_000, T)).toBe(0);
    expect(insuranceFeeKurus(200_000, T)).toBe(2_500); // 500 × %0,5 = 5 TL → en az 25 TL
    expect(insuranceFeeKurus(2_100_000, T)).toBe(10_000); // 20.000 TL × %0,5 = 100 TL
    expect(() => insuranceFeeKurus(10_000_001, T)).toThrow("100.000,00 TL");
    const q = calculatePrice({ distanceMeters: 5000, pickupAt: WED, declaredValueKurus: 2_100_000 }, T);
    expect(line(q, "insurance")).toBe(10_000);
    // Kurumsal indirime tabi değil
    expect(discountableKurus(q)).toBe(q.subtotalKurus - 10_000);
  });
});
