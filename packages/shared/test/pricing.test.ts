import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING_SETTINGS,
  PricingError,
  applyWaitingFee,
  calculateMonthlyInvoice,
  calculatePrice,
  corporateTierFor,
  formatTL,
  metersToBillableKm,
  nightOrHolidayAt,
  splitExtraKm,
  surchargePercents,
  waitingFeeKurus,
  type Holiday,
  type PricingSettings,
} from "../pricing.ts";

// Çekirdek kurallar sabit km ücretli ve tavansız ("eski") tarifeyle test edilir;
// kademe ve tavan aşağıda ayrıca test edilir.
const S: PricingSettings = { ...DEFAULT_PRICING_SETTINGS, kmTiers: [], maxSurchargePct: null };
const T = DEFAULT_PRICING_SETTINGS; // güncel tarife (kademeli km + %75 tavan)

// İstanbul saati (UTC+3) ile tarih üretir.
const ist = (isoLocal: string) => new Date(`${isoLocal}+03:00`);
const DAY = ist("2026-10-07T14:00:00"); // Çarşamba öğleden sonra, tatil değil

const holidays: Holiday[] = [
  { date: "2026-10-29", name: "Cumhuriyet Bayramı", halfDay: false },
  { date: "2026-10-28", name: "Cumhuriyet Bayramı Arifesi", halfDay: true },
];

describe("metersToBillableKm", () => {
  it("yukarı yuvarlar", () => {
    expect(metersToBillableKm(0)).toBe(0);
    expect(metersToBillableKm(1)).toBe(1);
    expect(metersToBillableKm(3000)).toBe(3);
    expect(metersToBillableKm(3001)).toBe(4);
  });
  it("geçersiz mesafede hata verir", () => {
    expect(() => metersToBillableKm(-1)).toThrow(PricingError);
    expect(() => metersToBillableKm(Number.NaN)).toThrow(PricingError);
  });
});

describe("calculatePrice — temel", () => {
  it("ilk 3 km açılış ücretine dahil", () => {
    const q = calculatePrice({ distanceMeters: 3000, pickupAt: DAY }, S);
    expect(q.subtotalKurus).toBe(35_000);
    expect(q.lines.map((l) => l.code)).toEqual(["base"]);
  });

  it("3,1 km → 4 km sayılır, 1 km ek ücret", () => {
    const q = calculatePrice({ distanceMeters: 3100, pickupAt: DAY }, S);
    expect(q.subtotalKurus).toBe(35_000 + 3_000);
    expect(q.meta.distanceKm).toBe(4);
  });

  it("12 km → 350 + 9×30 = 620 TL, KDV %20", () => {
    const q = calculatePrice({ distanceMeters: 12_000, pickupAt: DAY }, S);
    expect(q.subtotalKurus).toBe(62_000);
    expect(q.vatKurus).toBe(12_400);
    expect(q.totalKurus).toBe(74_400);
  });

  it("satırların toplamı ara toplama eşittir", () => {
    const q = calculatePrice(
      {
        distanceMeters: 9_400,
        roundTrip: true,
        urgent: true,
        weightKg: 12,
        waitingMinutes: 31,
        bridgeCrossings: 1,
        pickupAt: ist("2026-10-07T23:10:00"),
      },
      { ...S, bridgeFeeKurus: 6_000 },
    );
    expect(q.lines.reduce((s, l) => s + l.amountKurus, 0)).toBe(q.subtotalKurus);
  });
});

describe("calculatePrice — ek ücretler", () => {
  it("acil +%50", () => {
    const q = calculatePrice({ distanceMeters: 5_000, urgent: true, pickupAt: DAY }, S);
    // 350 + 2×30 = 410 → +205
    expect(q.subtotalKurus).toBe(41_000 + 20_500);
  });

  it("acil ve gece toplanır: +%100", () => {
    const q = calculatePrice(
      { distanceMeters: 3_000, urgent: true, pickupAt: ist("2026-10-07T23:00:00") },
      S,
    );
    expect(q.meta.surchargePct).toBe(100);
    expect(q.subtotalKurus).toBe(70_000);
  });

  it("gece ve tatil aynı anda olsa bile bir kez uygulanır", () => {
    const q = calculatePrice(
      { distanceMeters: 3_000, pickupAt: ist("2026-10-29T23:30:00"), holidays },
      S,
    );
    expect(q.meta.surchargePct).toBe(50);
    expect(q.subtotalKurus).toBe(52_500);
  });

  it("10 kg tam sınırda ek ücret yok, 10 kg üzeri +150 TL", () => {
    expect(calculatePrice({ distanceMeters: 1_000, weightKg: 10, pickupAt: DAY }, S).subtotalKurus).toBe(35_000);
    expect(calculatePrice({ distanceMeters: 1_000, weightKg: 10.1, pickupAt: DAY }, S).subtotalKurus).toBe(50_000);
  });

  it("büyük paket işareti ağırlıktan bağımsız +150 TL", () => {
    const q = calculatePrice({ distanceMeters: 1_000, largePackage: true, pickupAt: DAY }, S);
    expect(q.subtotalKurus).toBe(50_000);
  });

  it("ağır paket ücretine yüzde ek ücret uygulanmaz", () => {
    const q = calculatePrice({ distanceMeters: 3_000, urgent: true, weightKg: 15, pickupAt: DAY }, S);
    expect(q.subtotalKurus).toBe(35_000 + 17_500 + 15_000);
  });
});

describe("gece / tatil", () => {
  it.each([
    ["2026-10-07T21:59:00", false],
    ["2026-10-07T22:00:00", true],
    ["2026-10-08T03:00:00", true],
    ["2026-10-08T06:59:00", true],
    ["2026-10-08T07:00:00", false],
  ])("%s → gece=%s", (t, expected) => {
    expect(nightOrHolidayAt(ist(t), S).applies).toBe(expected);
  });

  it("resmi tatil gündüz de ek ücretlidir", () => {
    const r = nightOrHolidayAt(ist("2026-10-29T10:00:00"), S, holidays);
    expect(r).toEqual({ applies: true, holidayName: "Cumhuriyet Bayramı" });
  });

  it("arife günü 13:00'ten önce normal, sonra tatil", () => {
    expect(nightOrHolidayAt(ist("2026-10-28T12:59:00"), S, holidays).applies).toBe(false);
    expect(nightOrHolidayAt(ist("2026-10-28T13:00:00"), S, holidays).holidayName).toBe(
      "Cumhuriyet Bayramı Arifesi",
    );
  });

  it("UTC gece yarısı sınırında yerel tarih kullanılır", () => {
    // 2026-10-28T21:30Z = 29 Ekim 00:30 İstanbul → tatil
    const r = nightOrHolidayAt(new Date("2026-10-28T21:30:00Z"), S, holidays);
    expect(r.holidayName).toBe("Cumhuriyet Bayramı");
  });
});

describe("bekleme", () => {
  it.each([
    [0, 0],
    [15, 0],
    [16, 5_000],
    [25, 5_000],
    [26, 10_000],
    [35, 10_000],
    [36, 15_000],
  ])("%i dk → %i kuruş", (min, fee) => {
    expect(waitingFeeKurus(min, S)).toBe(fee);
  });

  it("bekleme ücretine yüzde ek ücret uygulanmaz", () => {
    const q = calculatePrice(
      { distanceMeters: 3_000, urgent: true, waitingMinutes: 20, pickupAt: DAY },
      S,
    );
    expect(q.subtotalKurus).toBe(35_000 + 17_500 + 5_000);
  });

  it("negatif bekleme hata verir", () => {
    expect(() => waitingFeeKurus(-1, S)).toThrow(PricingError);
  });
});

describe("gidiş-dönüş", () => {
  it("dönüş ayağı %50 indirimli", () => {
    const q = calculatePrice({ distanceMeters: 5_000, roundTrip: true, pickupAt: DAY }, S);
    // gidiş 410, dönüş 205
    expect(q.subtotalKurus).toBe(41_000 + 20_500);
  });

  it("dönüşte ek ücretler dahil fiyatın yarısı alınır", () => {
    const q = calculatePrice(
      { distanceMeters: 3_000, roundTrip: true, urgent: true, weightKg: 20, pickupAt: DAY },
      S,
    );
    const leg = 35_000 + 17_500 + 15_000;
    expect(q.subtotalKurus).toBe(leg + leg / 2);
  });

  it("dönüş mesafesi ayrı verilebilir", () => {
    const q = calculatePrice(
      { distanceMeters: 3_000, returnDistanceMeters: 7_000, roundTrip: true, pickupAt: DAY },
      S,
    );
    expect(q.meta.returnDistanceKm).toBe(7);
    expect(q.subtotalKurus).toBe(35_000 + (35_000 + 4 * 3_000) / 2);
  });

  it("köprü ücreti indirimsiz, geçiş başına eklenir", () => {
    const settings = { ...S, bridgeFeeKurus: 6_000 };
    const q = calculatePrice(
      { distanceMeters: 3_000, roundTrip: true, bridgeCrossings: 2, pickupAt: DAY },
      settings,
    );
    expect(q.subtotalKurus).toBe(35_000 + 17_500 + 12_000);
  });

  it("geçersiz köprü sayısı hata verir", () => {
    expect(() => calculatePrice({ distanceMeters: 1, bridgeCrossings: 1.5 }, S)).toThrow(PricingError);
  });
});

describe("ayarlar panelden değişebilir", () => {
  it("farklı parametrelerle hesaplar", () => {
    const q = calculatePrice(
      { distanceMeters: 10_000, pickupAt: DAY },
      { ...S, baseFeeKurus: 40_000, includedKm: 5, perKmKurus: 3_500 },
    );
    expect(q.subtotalKurus).toBe(40_000 + 5 * 3_500);
  });
});

describe("kurumsal ay sonu fatura", () => {
  it("kademe sınırları", () => {
    expect(corporateTierFor(19, S)).toBeNull();
    expect(corporateTierFor(20, S)?.discountPct).toBe(15);
    expect(corporateTierFor(49, S)?.discountPct).toBe(15);
    expect(corporateTierFor(50, S)?.discountPct).toBe(25);
  });

  it("indirim ay toplamına uygulanır", () => {
    const inv = calculateMonthlyInvoice(Array(20).fill(40_000), S);
    expect(inv.grossSubtotalKurus).toBe(800_000);
    expect(inv.discountKurus).toBe(120_000);
    expect(inv.subtotalKurus).toBe(680_000);
    expect(inv.totalKurus).toBe(816_000);
  });

  it("kademe altında indirim yok", () => {
    const inv = calculateMonthlyInvoice([35_000, 41_000], S);
    expect(inv.discountPct).toBe(0);
    expect(inv.subtotalKurus).toBe(76_000);
  });
});

describe("formatTL", () => {
  it("Türkçe biçim", () => {
    expect(formatTL(123_450)).toBe("1.234,50 TL");
  });
});

describe("applyWaitingFee", () => {
  const base = calculatePrice({ distanceMeters: 5_000, bridgeCrossings: 1, pickupAt: DAY }, { ...S, bridgeFeeKurus: 2_500 });

  it("ücretsiz süre içinde teklif değişmez", () => {
    expect(applyWaitingFee(base, 10, S)).toEqual(base);
  });

  it("bekleme satırı köprüden önce eklenir, KDV yeniden hesaplanır", () => {
    const q = applyWaitingFee(base, 32, S);
    expect(q.lines.map((l) => l.code)).toEqual(["base", "extra_km", "waiting", "bridge"]);
    expect(q.subtotalKurus).toBe(base.subtotalKurus + 10_000);
    expect(q.vatKurus).toBe(Math.round(q.subtotalKurus * 0.2));
  });

  it("tekrar çağrılınca çift eklemez (idempotent), azalırsa günceller", () => {
    const once = applyWaitingFee(base, 32, S);
    expect(applyWaitingFee(once, 32, S)).toEqual(once);
    expect(applyWaitingFee(once, 5, S).subtotalKurus).toBe(base.subtotalKurus);
  });

  it("tarife sonradan değişse de diğer kalemler korunur", () => {
    const q = applyWaitingFee(base, 20, { ...S, perKmKurus: 99_999 });
    expect(q.lines.find((l) => l.code === "extra_km")!.amountKurus).toBe(6_000);
  });
});

describe("kademeli km ücreti", () => {
  it("varsayılan kademeler: 3–10 km 25 TL, 10 km üstü 18 TL", () => {
    expect(splitExtraKm(3, T)).toEqual([]);
    expect(splitExtraKm(5, T)).toEqual([{ km: 2, perKmKurus: 2_500 }]);
    expect(splitExtraKm(10, T)).toEqual([{ km: 7, perKmKurus: 2_500 }]);
    expect(splitExtraKm(11, T)).toEqual([
      { km: 7, perKmKurus: 2_500 },
      { km: 1, perKmKurus: 1_800 },
    ]);
  });

  it("kademe boşsa sabit km ücreti", () => {
    expect(splitExtraKm(5, S)).toEqual([{ km: 2, perKmKurus: 3_000 }]);
  });

  it("sırasız tanımlanmış kademeler ve son kademesi sınırlı tablo", () => {
    const s = { ...T, kmTiers: [{ uptoKm: 20, perKmKurus: 2_000 }, { uptoKm: 8, perKmKurus: 2_600 }] };
    expect(splitExtraKm(25, s)).toEqual([
      { km: 5, perKmKurus: 2_600 },
      { km: 12, perKmKurus: 2_000 },
      { km: 5, perKmKurus: 2_000 },
    ]);
  });

  it("araştırma senaryoları (KDV hariç)", () => {
    const at = (iso: string) => ist(iso);
    expect(calculatePrice({ distanceMeters: 5_000, pickupAt: DAY }, T).subtotalKurus).toBe(40_000); // S1
    // S2: 12 km acil → (350 + 7×25 + 2×18) × 1,5 = 841,50
    expect(calculatePrice({ distanceMeters: 12_000, urgent: true, pickupAt: DAY }, T).subtotalKurus).toBe(84_150);
    // S4: 22 km köprülü → 350 + 175 + 12×18 + 25 = 766
    expect(calculatePrice({ distanceMeters: 22_000, bridgeCrossings: 1, pickupAt: at("2026-10-07T14:00:00") }, T).subtotalKurus).toBe(76_600);
  });

  it("kalem etiketi kademeleri gösterir", () => {
    const q = calculatePrice({ distanceMeters: 12_000, pickupAt: DAY }, T);
    expect(q.lines.find((l) => l.code === "extra_km")!.label).toBe("Ek mesafe (7 km × 25 TL + 2 km × 18 TL)");
  });
});

describe("ek ücret tavanı", () => {
  it("acil + gece %100 yerine en fazla %75", () => {
    expect(surchargePercents(true, true, T)).toEqual({ urgentPct: 50, nightPct: 25, capped: true });
    const q = calculatePrice({ distanceMeters: 3_000, urgent: true, pickupAt: ist("2026-10-07T23:00:00") }, T);
    expect(q.meta.surchargePct).toBe(75);
    expect(q.subtotalKurus).toBe(35_000 + 17_500 + 8_750);
    expect(q.lines.find((l) => l.code === "night_holiday")!.label).toBe("Gece teslimatı (+%25, toplam ek ücret en fazla %75)");
  });

  it("tek ek ücret tavanın altındaysa dokunulmaz", () => {
    expect(surchargePercents(true, false, T)).toEqual({ urgentPct: 50, nightPct: 0, capped: false });
    expect(surchargePercents(false, true, T)).toEqual({ urgentPct: 0, nightPct: 50, capped: false });
  });

  it("tavan acil ücretinden düşükse gece payı sıfırlanır, satır eklenmez", () => {
    const s = { ...T, maxSurchargePct: 40 };
    expect(surchargePercents(true, true, s)).toEqual({ urgentPct: 40, nightPct: 0, capped: true });
    const q = calculatePrice({ distanceMeters: 3_000, urgent: true, pickupAt: ist("2026-10-07T23:00:00") }, s);
    expect(q.lines.some((l) => l.code === "night_holiday")).toBe(false);
    expect(q.subtotalKurus).toBe(35_000 + 14_000);
  });

  it("dönüş ayağı da tavanlı yüzdeyle hesaplanır", () => {
    const q = calculatePrice({ distanceMeters: 3_000, urgent: true, roundTrip: true, pickupAt: ist("2026-10-07T23:00:00") }, T);
    const leg = 35_000 + 26_250;
    expect(q.subtotalKurus).toBe(leg + leg / 2);
  });
});
