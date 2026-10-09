/**
 * Kurye hakedişi, birim maliyet ve marj (panel → Fiyatlar ve Hakediş, kurye uygulaması → Kazancım).
 * Varsayılanlar docs/fiyat-arastirmasi.md §3 ve §8'deki esnaf kurye modelinden gelir:
 * kurye paket başı + km başı ücret alır, yakıt ve motor kuryede. Değerler `cost_settings` tablosunda,
 * panelden değiştirilir. Hakediş ve marj tahmini aynı fonksiyonu (courierEarning) kullanır.
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
  /** Bekleme ücretinden kuryeye verilen pay (%) */
  waitingSharePct: number;
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
  waitingSharePct: 50,
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

export interface CourierEarning {
  /** Ödenen km: gidiş + dönüş ayağı + uzak alışta merkezden fazlası */
  km: number;
  jobKurus: number;
  kmKurus: number;
  bonusPct: number;
  bonusKurus: number;
  waitingKurus: number;
  /** Köprü geçişi kuryeye aynen iade edilir (kurye HGS ile öder) */
  bridgeKurus: number;
  totalKurus: number;
}

/** Bir teslimatın kurye hakedişi; siparişin kayıtlı teklifinden (price_quote) hesaplanır */
export function courierEarning(
  quote: Pick<PriceQuote, "lines" | "meta">,
  model: CostModel = DEFAULT_COST_MODEL,
  settings: Pick<PricingSettings, "freePickupRadiusKm"> = DEFAULT_PRICING_SETTINGS,
): CourierEarning {
  const meta = quote.meta;
  const level = meta.serviceLevel ?? "standart";
  const remoteKm = Math.max(0, Math.ceil((meta.pickupFromCenterKm ?? 0) - settings.freePickupRadiusKm));
  const km = (meta.distanceKm ?? 0) + (meta.returnDistanceKm ?? 0) + remoteKm;
  const jobKurus = level === "ekonomi" ? pct(model.courierPerJobKurus, model.economyJobPayPct) : model.courierPerJobKurus;
  const kmKurus = km * model.courierPerKmKurus;
  const bonusPct = (level === "acil" ? model.urgentBonusPct : 0) + (meta.nightOrHoliday ? model.offHoursBonusPct : 0);
  const bonusKurus = pct(jobKurus + kmKurus, bonusPct);
  const sum = (code: string) => quote.lines.filter((l) => l.code === code).reduce((s, l) => s + l.amountKurus, 0);
  const waitingKurus = pct(sum("waiting"), model.waitingSharePct);
  const bridgeKurus = sum("bridge");
  return {
    km,
    jobKurus,
    kmKurus,
    bonusPct,
    bonusKurus,
    waitingKurus,
    bridgeKurus,
    totalKurus: jobKurus + kmKurus + bonusKurus + waitingKurus + bridgeKurus,
  };
}

export function estimateJobCost(
  quote: PriceQuote,
  model: CostModel = DEFAULT_COST_MODEL,
  opts: { card?: boolean; settings?: Pick<PricingSettings, "freePickupRadiusKm"> } = {},
): JobCost {
  const e = courierEarning(quote, model, opts.settings);
  const courierKurus = e.totalKurus - e.bridgeKurus;
  const passThroughKurus = e.bridgeKurus;
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

export interface CourierBalance {
  /** Ödenmemiş hedef primleri */
  incentiveKurus: number;
  deliveries: number;
  earningsKurus: number;
  /** Kuryenin müşteriden nakit tahsil edip elinde tuttuğu tutar */
  cashKurus: number;
  /** Kuryeye ödenecek net (eksi ise kurye şirkete öder) */
  netKurus: number;
}

/** Ödenmemiş hakediş satırlarından kurye bakiyesi: hakediş − elindeki nakit */
export function courierBalance(rows: Array<{ totalKurus: number; cashCollectedKurus: number }>, incentiveKurus = 0): CourierBalance {
  const earningsKurus = rows.reduce((s, r) => s + r.totalKurus, 0);
  const cashKurus = rows.reduce((s, r) => s + r.cashCollectedKurus, 0);
  // Hedef primleri hakedişe eklenir (courier_incentive_awards)
  return { deliveries: rows.length, earningsKurus, cashKurus, incentiveKurus, netKurus: earningsKurus + incentiveKurus - cashKurus };
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
