/**
 * Yazgan Kurye fiyat hesabı — TEK KAYNAK.
 *
 * Mobil uygulama, yönetim paneli, Edge Functions ve yapay zeka asistanı
 * fiyatı yalnızca bu dosyadaki fonksiyonlarla hesaplar. Tüm parametreler
 * `PricingSettings` üzerinden gelir (veritabanında `pricing_settings`).
 *
 * Tutarlar kuruş cinsinden tam sayıdır (35000 = 350,00 TL).
 * Hesaplanan sipariş fiyatları KDV hariçtir; KDV ayrı satırda gösterilir.
 */

export interface CorporateTier {
  /** Bu kademeye girmek için ay içindeki asgari teslimat sayısı */
  minDeliveries: number;
  discountPct: number;
}

/** Ek km kademesi: toplam mesafe `uptoKm`'ye kadar olan kilometreler bu ücretle (null = üstü) */
export interface KmTier {
  uptoKm: number | null;
  perKmKurus: number;
}

export interface PricingSettings {
  baseFeeKurus: number;
  includedKm: number;
  /** Kademe tanımlı değilse (kmTiers boş) tüm ek km'lere uygulanan ücret */
  perKmKurus: number;
  /** Kademeli ek km ücreti; boşsa perKmKurus kullanılır */
  kmTiers: KmTier[];
  /** Acil + gece/tatil toplam ek ücret tavanı (%); null = tavan yok */
  maxSurchargePct: number | null;
  urgentSurchargePct: number;
  /** Gece ve resmi tatil için tek ek ücret (ikisi birden olsa da bir kez uygulanır) */
  nightHolidaySurchargePct: number;
  nightStartHour: number;
  nightEndHour: number;
  /** Arife günlerinde tatil ücretinin başladığı saat */
  halfDayStartHour: number;
  waitingFreeMinutes: number;
  waitingBlockMinutes: number;
  waitingBlockFeeKurus: number;
  returnLegDiscountPct: number;
  heavyThresholdKg: number;
  heavySurchargeKurus: number;
  /** Ücretli köprü/tünel geçişi başına eklenen tutar */
  bridgeFeeKurus: number;
  corporateTiers: CorporateTier[];
  vatPct: number;
  /** Türkiye 2016'dan beri sabit UTC+3 */
  utcOffsetMinutes: number;
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  baseFeeKurus: 35_000,
  includedKm: 3,
  perKmKurus: 3_000,
  // 2026-10-08 fiyat araştırması önerisi (docs/fiyat-arastirmasi.md §6.3)
  kmTiers: [
    { uptoKm: 10, perKmKurus: 2_500 },
    { uptoKm: null, perKmKurus: 1_800 },
  ],
  maxSurchargePct: 75,
  urgentSurchargePct: 50,
  nightHolidaySurchargePct: 50,
  nightStartHour: 22,
  nightEndHour: 7,
  halfDayStartHour: 13,
  waitingFreeMinutes: 15,
  waitingBlockMinutes: 10,
  waitingBlockFeeKurus: 5_000,
  returnLegDiscountPct: 50,
  heavyThresholdKg: 10,
  heavySurchargeKurus: 15_000,
  bridgeFeeKurus: 2_500,
  corporateTiers: [
    { minDeliveries: 20, discountPct: 15 },
    { minDeliveries: 50, discountPct: 25 },
  ],
  vatPct: 20,
  utcOffsetMinutes: 180,
};

export interface Holiday {
  /** Yerel tarih, YYYY-MM-DD */
  date: string;
  name: string;
  /** Arife: ek ücret `halfDayStartHour`dan itibaren uygulanır */
  halfDay: boolean;
}

export interface PriceInput {
  /** Alış → teslim sürüş mesafesi (Distance Matrix), metre */
  distanceMeters: number;
  /** Gidiş-dönüşte dönüş ayağı mesafesi; verilmezse gidişle aynı kabul edilir */
  returnDistanceMeters?: number;
  roundTrip?: boolean;
  urgent?: boolean;
  /** Alış zamanı; verilmezse "şimdi" */
  pickupAt?: Date;
  weightKg?: number;
  /** Ağırlıktan bağımsız büyük paket işareti */
  largePackage?: boolean;
  /** Ücretli köprü/tünel geçiş sayısı (gidiş + dönüş toplamı) */
  bridgeCrossings?: number;
  /** Alışta beklenen dakika (teslimattan sonra gerçek süreyle yeniden hesaplanır) */
  waitingMinutes?: number;
  holidays?: Holiday[];
}

export type PriceLineCode =
  | "base"
  | "extra_km"
  | "urgent"
  | "night_holiday"
  | "heavy"
  | "return_leg"
  | "waiting"
  | "bridge";

export interface PriceLine {
  code: PriceLineCode;
  label: string;
  amountKurus: number;
}

export interface PriceQuote {
  lines: PriceLine[];
  /** KDV hariç toplam */
  subtotalKurus: number;
  vatKurus: number;
  /** KDV dahil toplam */
  totalKurus: number;
  /** Hesaba esas bilgiler — siparişle birlikte saklanır */
  meta: {
    distanceKm: number;
    returnDistanceKm: number | null;
    nightOrHoliday: boolean;
    holidayName: string | null;
    surchargePct: number;
  };
}

export class PricingError extends Error {}

const pct = (amountKurus: number, percent: number) => Math.round((amountKurus * percent) / 100);

/** Metreyi yukarı yuvarlanmış tam km'ye çevirir. */
export function metersToBillableKm(meters: number): number {
  if (!Number.isFinite(meters) || meters < 0) {
    throw new PricingError("Mesafe geçersiz");
  }
  return Math.ceil(meters / 1000);
}

function toLocal(date: Date, settings: PricingSettings) {
  const local = new Date(date.getTime() + settings.utcOffsetMinutes * 60_000);
  const iso = local.toISOString();
  return { date: iso.slice(0, 10), hour: local.getUTCHours() };
}

export function isNightHour(hour: number, settings: PricingSettings): boolean {
  const { nightStartHour: start, nightEndHour: end } = settings;
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/** Alış zamanı gece aralığında veya resmi tatildeyse ek ücret uygulanır. */
export function nightOrHolidayAt(
  at: Date,
  settings: PricingSettings,
  holidays: Holiday[] = [],
): { applies: boolean; holidayName: string | null } {
  const { date, hour } = toLocal(at, settings);
  const holiday = holidays.find(
    (h) => h.date === date && (!h.halfDay || hour >= settings.halfDayStartHour),
  );
  if (holiday) return { applies: true, holidayName: holiday.name };
  return { applies: isNightHour(hour, settings), holidayName: null };
}

/** İlk ücretsiz dakikalardan sonra başlayan her dilim ücretlenir. */
export function waitingFeeKurus(minutes: number, settings: PricingSettings): number {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new PricingError("Bekleme süresi geçersiz");
  }
  const billable = minutes - settings.waitingFreeMinutes;
  if (billable <= 0) return 0;
  return Math.ceil(billable / settings.waitingBlockMinutes) * settings.waitingBlockFeeKurus;
}

/** Ek km'leri kademelere böler: [{ km, perKmKurus }] (sıralı, boş kademeler atlanır) */
export function splitExtraKm(km: number, settings: PricingSettings): Array<{ km: number; perKmKurus: number }> {
  const extraKm = Math.max(0, km - settings.includedKm);
  if (extraKm === 0) return [];
  const tiers = [...settings.kmTiers].sort((a, b) => (a.uptoKm ?? Infinity) - (b.uptoKm ?? Infinity));
  if (!tiers.length) return [{ km: extraKm, perKmKurus: settings.perKmKurus }];
  const parts: Array<{ km: number; perKmKurus: number }> = [];
  let from = settings.includedKm; // bu km'den sonrası ücretlenir
  for (const t of tiers) {
    if (from >= km) break;
    const upto = Math.min(km, t.uptoKm ?? Infinity);
    if (upto > from) {
      parts.push({ km: upto - from, perKmKurus: t.perKmKurus });
      from = upto;
    }
  }
  // Son kademe sınırlıysa kalan km son kademenin ücretiyle
  if (from < km) parts.push({ km: km - from, perKmKurus: tiers[tiers.length - 1]!.perKmKurus });
  return parts;
}

function distanceFeeKurus(km: number, settings: PricingSettings) {
  const parts = splitExtraKm(km, settings);
  const extraKm = parts.reduce((s, p) => s + p.km, 0);
  const extra = parts.reduce((s, p) => s + p.km * p.perKmKurus, 0);
  return { base: settings.baseFeeKurus, extraKm, extra, parts };
}

/** Acil ve gece/tatil ek ücret yüzdeleri; toplam tavanı aşarsa gece/tatil payı kırpılır. */
export function surchargePercents(urgent: boolean, nightOrHoliday: boolean, settings: PricingSettings) {
  const urgentPct = urgent ? settings.urgentSurchargePct : 0;
  const rawNightPct = nightOrHoliday ? settings.nightHolidaySurchargePct : 0;
  const cap = settings.maxSurchargePct;
  if (cap == null || urgentPct + rawNightPct <= cap) return { urgentPct, nightPct: rawNightPct, capped: false };
  const u = Math.min(urgentPct, cap);
  return { urgentPct: u, nightPct: Math.max(0, cap - u), capped: true };
}

const tl = (kurus: number) => (kurus / 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export function calculatePrice(
  input: PriceInput,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS,
): PriceQuote {
  const km = metersToBillableKm(input.distanceMeters);
  const lines: PriceLine[] = [];

  const { applies: nightOrHoliday, holidayName } = nightOrHolidayAt(
    input.pickupAt ?? new Date(),
    settings,
    input.holidays,
  );
  // Acil ve gece/tatil ek ücretleri toplanır; toplam tavanı (maxSurchargePct) aşamaz.
  const { urgentPct, nightPct, capped } = surchargePercents(!!input.urgent, nightOrHoliday, settings);
  const surchargePct = urgentPct + nightPct;
  const heavy =
    !!input.largePackage || (input.weightKg ?? 0) > settings.heavyThresholdKg;

  // Bir ayağın fiyatı: açılış + ek km + yüzde ek ücretler + ağır paket.
  const legTotal = (legKm: number) => {
    const d = distanceFeeKurus(legKm, settings);
    const distance = d.base + d.extra;
    return distance + pct(distance, surchargePct) + (heavy ? settings.heavySurchargeKurus : 0);
  };

  const outbound = distanceFeeKurus(km, settings);
  lines.push({ code: "base", label: `Açılış ücreti (ilk ${settings.includedKm} km dahil)`, amountKurus: outbound.base });
  if (outbound.extraKm > 0) {
    lines.push({
      code: "extra_km",
      label: `Ek mesafe (${outbound.parts.map((p) => `${p.km} km × ${tl(p.perKmKurus)} TL`).join(" + ")})`,
      amountKurus: outbound.extra,
    });
  }
  const outboundDistance = outbound.base + outbound.extra;
  if (input.urgent) {
    lines.push({
      code: "urgent",
      label: `Acil teslimat (+%${urgentPct})`,
      amountKurus: pct(outboundDistance, urgentPct),
    });
  }
  if (nightOrHoliday && nightPct > 0) {
    const capNote = capped ? `, toplam ek ücret en fazla %${settings.maxSurchargePct}` : "";
    lines.push({
      code: "night_holiday",
      label: holidayName
        ? `Resmi tatil – ${holidayName} (+%${nightPct}${capNote})`
        : `Gece teslimatı (+%${nightPct}${capNote})`,
      amountKurus: pct(outboundDistance, nightPct),
    });
  }
  if (heavy) {
    lines.push({
      code: "heavy",
      label: `Büyük / ${settings.heavyThresholdKg} kg üzeri paket`,
      amountKurus: settings.heavySurchargeKurus,
    });
  }

  let returnKm: number | null = null;
  if (input.roundTrip) {
    returnKm = metersToBillableKm(input.returnDistanceMeters ?? input.distanceMeters);
    const full = legTotal(returnKm);
    lines.push({
      code: "return_leg",
      label: `Dönüş ayağı (${returnKm} km, %${settings.returnLegDiscountPct} indirimli)`,
      amountKurus: full - pct(full, settings.returnLegDiscountPct),
    });
  }

  const waiting = waitingFeeKurus(input.waitingMinutes ?? 0, settings);
  if (waiting > 0) {
    lines.push({
      code: "waiting",
      label: `Bekleme (${input.waitingMinutes} dk, ilk ${settings.waitingFreeMinutes} dk ücretsiz)`,
      amountKurus: waiting,
    });
  }

  const crossings = input.bridgeCrossings ?? 0;
  if (!Number.isInteger(crossings) || crossings < 0) {
    throw new PricingError("Köprü geçiş sayısı geçersiz");
  }
  if (crossings > 0 && settings.bridgeFeeKurus > 0) {
    lines.push({
      code: "bridge",
      label: `Köprü / tünel geçişi (${crossings} ×)`,
      amountKurus: crossings * settings.bridgeFeeKurus,
    });
  }

  const subtotalKurus = lines.reduce((sum, l) => sum + l.amountKurus, 0);
  const vatKurus = pct(subtotalKurus, settings.vatPct);
  return {
    lines,
    subtotalKurus,
    vatKurus,
    totalKurus: subtotalKurus + vatKurus,
    meta: { distanceKm: km, returnDistanceKm: returnKm, nightOrHoliday, holidayName, surchargePct },
  };
}

/** Ay içindeki teslimat sayısına göre kurumsal kademe (yoksa null). */
export function corporateTierFor(
  deliveryCount: number,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS,
): CorporateTier | null {
  return (
    [...settings.corporateTiers]
      .sort((a, b) => b.minDeliveries - a.minDeliveries)
      .find((t) => deliveryCount >= t.minDeliveries) ?? null
  );
}

export interface MonthlyInvoice {
  deliveryCount: number;
  grossSubtotalKurus: number;
  discountPct: number;
  discountKurus: number;
  subtotalKurus: number;
  vatKurus: number;
  totalKurus: number;
}

/**
 * Kurumsal müşterinin ay sonu tek faturası. İndirim, ay içinde teslim edilen
 * siparişlerin KDV hariç toplamına uygulanır; kademe o ayın teslimat sayısıyla belirlenir.
 */
export function calculateMonthlyInvoice(
  deliveredSubtotalsKurus: number[],
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS,
): MonthlyInvoice {
  const deliveryCount = deliveredSubtotalsKurus.length;
  const grossSubtotalKurus = deliveredSubtotalsKurus.reduce((s, v) => s + v, 0);
  const discountPct = corporateTierFor(deliveryCount, settings)?.discountPct ?? 0;
  const discountKurus = pct(grossSubtotalKurus, discountPct);
  const subtotalKurus = grossSubtotalKurus - discountKurus;
  const vatKurus = pct(subtotalKurus, settings.vatPct);
  return {
    deliveryCount,
    grossSubtotalKurus,
    discountPct,
    discountKurus,
    subtotalKurus,
    vatKurus,
    totalKurus: subtotalKurus + vatKurus,
  };
}

/** Kuruşu "1.234,50 TL" biçiminde gösterir. */
export function formatTL(kurus: number): string {
  return (
    (kurus / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " TL"
  );
}

/**
 * Alışta oluşan beklemeyi onaylanmış teklife ekler (veya günceller). Diğer kalemler
 * sipariş anındaki gibi kalır; yalnızca bekleme satırı ve toplamlar yeniden hesaplanır.
 */
export function applyWaitingFee(
  quote: PriceQuote,
  waitingMinutes: number,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS,
): PriceQuote {
  const fee = waitingFeeKurus(waitingMinutes, settings);
  const lines = quote.lines.filter((l) => l.code !== "waiting");
  if (fee > 0) {
    const waitingLine: PriceLine = {
      code: "waiting",
      label: `Bekleme (${waitingMinutes} dk, ilk ${settings.waitingFreeMinutes} dk ücretsiz)`,
      amountKurus: fee,
    };
    // Köprü satırından önce, değilse sona
    const bridgeIdx = lines.findIndex((l) => l.code === "bridge");
    lines.splice(bridgeIdx === -1 ? lines.length : bridgeIdx, 0, waitingLine);
  }
  const subtotalKurus = lines.reduce((s, l) => s + l.amountKurus, 0);
  // KDV oranı teklifin kendisinden korunur (sipariş anındaki oran)
  const vatPct = quote.subtotalKurus > 0 ? Math.round((quote.vatKurus / quote.subtotalKurus) * 10_000) / 100 : settings.vatPct;
  const vatKurus = pct(subtotalKurus, vatPct);
  return { ...quote, lines, subtotalKurus, vatKurus, totalKurus: subtotalKurus + vatKurus };
}
