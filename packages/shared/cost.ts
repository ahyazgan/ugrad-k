/**
 * Birim maliyet ve marj tahmini (panel → Fiyatlar → senaryo tablosu).
 * Varsayılanlar docs/fiyat-arastirmasi.md §3 ve §8'deki esnaf kurye modelinden gelir:
 * kurye paket başı + km başı ücret alır, yakıt ve motor kuryede. Değerler öneridir, piyasa verisi değildir.
 */
import { DEFAULT_PRICING_SETTINGS, type PriceQuote, type PricingSettings } from "./pricing.ts";

export interface CostModel {
  /** Kuryeye iş başı ödeme */
  courierPerJobKurus: number;
  /** Kuryeye km başı ödeme (yakıt ve aşınma dahil); dönüş ayağı ve uzak alış km'si de ödenir */
  courierPerKmKurus: number;
  /** Acil işte kurye primi (kurye ödemesine %) */
  urgentBonusPct: number;
  /** Gece / Pazar / tatil işte kurye primi (kurye ödemesine %) */
  offHoursBonusPct: number;
  /** Ekonomi işler rotada birleştiği için iş başı ödemenin uygulanan oranı (%) */
  economyJobPayPct: number;
  /** İş başı genel gider: yazılım, SMS/WhatsApp, harita API, sigorta, muhasebe payı */
  overheadPerJobKurus: number;
  /** Kartla ödemede sanal POS komisyonu (KDV dahil tutara %) */
  cardFeePct: number;
}

export const DEFAULT_COST_MODEL: CostModel = {
  courierPerJobKurus: 15_000,
  courierPerKmKurus: 1_200,
  urgentBonusPct: 30,
  offHoursBonusPct: 30,
  economyJobPayPct: 60,
  overheadPerJobKurus: 3_000,
  cardFeePct: 2.5,
};

export interface JobCost {
  courierKurus: number;
  overheadKurus: number;
  /** Köprü ücreti gibi aynen ödenen kalemler */
  passThroughKurus: number;
  paymentFeeKurus: number;
  totalKurus: number;
  /** KDV hariç gelir − maliyet */
  marginKurus: number;
  /** Marj / KDV hariç gelir (%) */
  marginPct: number;
}

const pct = (amount: number, p: number) => Math.round((amount * p) / 100);

export function estimateJobCost(
  quote: PriceQuote,
  model: CostModel = DEFAULT_COST_MODEL,
  opts: { card?: boolean; settings?: Pick<PricingSettings, "freePickupRadiusKm"> } = {},
): JobCost {
  const { meta } = quote;
  const level = meta.serviceLevel ?? "standart";
  const radius = (opts.settings ?? DEFAULT_PRICING_SETTINGS).freePickupRadiusKm;
  const remoteKm = Math.max(0, Math.ceil((meta.pickupFromCenterKm ?? 0) - radius));
  const km = meta.distanceKm + (meta.returnDistanceKm ?? 0) + remoteKm;
  const jobPay = level === "ekonomi" ? pct(model.courierPerJobKurus, model.economyJobPayPct) : model.courierPerJobKurus;
  const basePay = jobPay + km * model.courierPerKmKurus;
  const bonusPct = (level === "acil" ? model.urgentBonusPct : 0) + (meta.nightOrHoliday ? model.offHoursBonusPct : 0);
  const courierKurus = basePay + pct(basePay, bonusPct);
  const passThroughKurus = quote.lines.filter((l) => l.code === "bridge").reduce((s, l) => s + l.amountKurus, 0);
  const paymentFeeKurus = opts.card ? pct(quote.totalKurus, model.cardFeePct) : 0;
  const totalKurus = courierKurus + model.overheadPerJobKurus + passThroughKurus + paymentFeeKurus;
  const marginKurus = quote.subtotalKurus - totalKurus;
  return {
    courierKurus,
    overheadKurus: model.overheadPerJobKurus,
    passThroughKurus,
    paymentFeeKurus,
    totalKurus,
    marginKurus,
    marginPct: quote.subtotalKurus ? Math.round((marginKurus / quote.subtotalKurus) * 1000) / 10 : 0,
  };
}

/** Para alanları (köprü hariç: resmi tarife) enflasyon/endeks oranıyla güncellenir */
export const INDEXED_MONEY_FIELDS = [
  "baseFeeKurus",
  "perKmKurus",
  "waitingBlockFeeKurus",
  "heavySurchargeKurus",
  "remotePickupPerKmKurus",
  "remotePickupMaxKurus",
] as const satisfies ReadonlyArray<keyof PricingSettings>;

/** 100 TL ve üstü 5 TL'ye, altı 0,50 TL'ye yuvarlanır (müşteriye okunur tutarlar) */
export function roundPrice(kurus: number): number {
  const step = kurus >= 10_000 ? 500 : 50;
  return Math.round(kurus / step) * step;
}

/**
 * Tarifeyi endeksler (ör. üç aylık TÜFE). Köprü ücreti, yüzdeler ve kademe sınırları değişmez.
 * Kaydetmeden önce panelde önizlenir.
 */
export function indexPricingSettings(settings: PricingSettings, ratePct: number): PricingSettings {
  if (!Number.isFinite(ratePct) || ratePct <= -50 || ratePct > 200) throw new RangeError("Endeks oranı -%50 ile %200 arasında olmalı");
  const f = (k: number) => roundPrice(k * (1 + ratePct / 100));
  const next: PricingSettings = { ...settings, kmTiers: settings.kmTiers.map((t) => ({ ...t, perKmKurus: f(t.perKmKurus) })) };
  for (const key of INDEXED_MONEY_FIELDS) next[key] = f(settings[key]);
  return next;
}
