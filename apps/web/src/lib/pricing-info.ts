import {
  calculateMonthlyInvoice,
  calculatePrice,
  DEFAULT_PRICING_SETTINGS,
  formatTL,
  monthlyInvoiceItem,
  type PriceQuote,
  type PricingSettings,
  type ServiceLevel,
} from "@yazgan/shared";

// Every number shown on the site is derived from packages/shared/pricing.ts (defaults + price function).

export interface TariffRow {
  label: string;
  value: string;
}

/** Whole-lira amounts read better in tables: "350,00 TL" → "350 TL" */
export const tl = (k: number) => formatTL(k).replace(",00 TL", " TL");
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Opening fee + km tiers (the first lines of every receipt). */
export function baseRows(s: PricingSettings = DEFAULT_PRICING_SETTINGS): TariffRow[] {
  const rows: TariffRow[] = [{ label: `Açılış (ilk ${s.includedKm} km dahil)`, value: tl(s.baseFeeKurus) }];
  if (s.kmTiers.length) {
    let from = s.includedKm;
    for (const t of s.kmTiers) {
      rows.push({
        label: t.uptoKm == null ? `${from} km üzeri, km başına` : `${from}–${t.uptoKm} km arası, km başına`,
        value: tl(t.perKmKurus),
      });
      if (t.uptoKm != null) from = t.uptoKm;
    }
  } else {
    rows.push({ label: "Ek km başına", value: tl(s.perKmKurus) });
  }
  return rows;
}

/** Tarife özetini (KDV hariç) okunur satırlara çevirir. Kaynak: packages/shared/pricing.ts */
export function pricingRows(s: PricingSettings = DEFAULT_PRICING_SETTINGS): TariffRow[] {
  const g = tariffGroups(s);
  return [...g.base.rows, ...g.urgent.rows, ...g.time.rows, ...g.roundTrip.rows, ...g.road.rows, ...g.limits.rows];
}

export interface TariffGroup {
  title: string;
  rows: TariffRow[];
  notes: string[];
}

/** Tariff grouped for the three cards on /fiyatlar: base · surcharges (urgent, time, round trip, road) · limits. */
export function tariffGroups(s: PricingSettings = DEFAULT_PRICING_SETTINGS) {
  const base: TariffGroup = {
    title: "Temel",
    rows: [
      ...baseRows(s),
      { label: "Standart: en kısa sürede teslim", value: "tarife" },
      { label: `Ekonomi: gün içinde teslim (Pzt–Cmt ${hh(s.nightEndHour)}–${hh(s.economyCutoffHour)} arası alış)`, value: `−%${s.economyDiscountPct}` },
    ],
    notes: ["Km, sürüş mesafesine göre yukarı yuvarlanır.", "Ekonomi gönderiler aynı gün içinde, uygun kurye rotasıyla teslim edilir."],
  };
  const urgent: TariffGroup = {
    title: "Acil",
    rows: [{ label: "Acil teslimat (60 dakika)", value: `+%${s.urgentSurchargePct}` }],
    notes: ["60 dakika taahhüdü: kaçırırsak acil ek ücreti sonraki siparişinizden düşülür."],
  };
  const time: TariffGroup = {
    title: "Gece, Pazar, tatil",
    rows: [
      { label: `Gece (${hh(s.nightStartHour)}–${hh(s.nightEndHour)})`, value: `+%${s.nightSurchargePct}` },
      { label: "Pazar", value: `+%${s.sundaySurchargePct}` },
      { label: `Resmi tatil (arife ${hh(s.halfDayStartHour)}'ten itibaren)`, value: `+%${s.nightHolidaySurchargePct}` },
      ...(s.maxSurchargePct != null ? [{ label: "Acil dahil ek ücretlerin toplamı en fazla", value: `%${s.maxSurchargePct}` }] : []),
    ],
    notes: ["Gece, Pazar ve tatil ekleri birlikte gelirse toplanmaz, yalnızca en yükseği uygulanır."],
  };
  const roundTrip: TariffGroup = {
    title: "Gidiş-dönüş ve bekleme",
    rows: [
      { label: "Gidiş-dönüş: dönüş ayağında indirim", value: `%${s.returnLegDiscountPct}` },
      { label: `Bekleme (ilk ${s.waitingFreeMinutes} dk ücretsiz), başlayan her ${s.waitingBlockMinutes} dk`, value: tl(s.waitingBlockFeeKurus) },
    ],
    notes: ["Dönüş ayağı, ek ücretler dahil fiyatın yarısıdır; köprü ücreti indirimsizdir."],
  };
  const road: TariffGroup = {
    title: "Köprü ve uzak alış",
    rows: [
      { label: "Avrupa yakasına köprü geçişi", value: `+${tl(s.bridgeFeeKurus)}` },
      ...(s.remotePickupPerKmKurus > 0
        ? [
            {
              label: `Uzak alış: merkezimize ${s.freePickupRadiusKm} km'den uzak adreslerde km başına (en fazla ${tl(s.remotePickupMaxKurus)})`,
              value: `+${tl(s.remotePickupPerKmKurus)}`,
            },
          ]
        : []),
    ],
    notes: ["Köprü ücreti yalnızca Anadolu yakasından Avrupa yakasına geçişte uygulanır."],
  };
  const limits: TariffGroup = {
    title: "Sınırlar",
    rows: [
      ...(s.maxWeightKg != null ? [{ label: "Motosikletle taşınabilen en fazla ağırlık", value: `${s.maxWeightKg} kg` }] : []),
      { label: `${s.heavyThresholdKg} kg üzeri / büyük paket`, value: `+${tl(s.heavySurchargeKurus)}` },
      {
        label: `Değer beyanı: ${tl(s.freeCoverageKurus)}'ye kadar ücretsiz güvence; üstü (en az ${tl(s.insuranceMinKurus)})`,
        value: `%${s.insuranceRatePct.toLocaleString("tr-TR")}`,
      },
      ...(s.maxDeclaredValueKurus != null ? [{ label: "Beyan edilebilecek en yüksek gönderi değeri", value: tl(s.maxDeclaredValueKurus) }] : []),
    ],
    notes: [],
  };
  return { base, urgent, time, roundTrip, road, limits };
}

export function corporateRows(s: PricingSettings = DEFAULT_PRICING_SETTINGS) {
  return s.corporateTiers.map((t) => ({ label: `Ayda ${t.minDeliveries}+ teslimat`, value: `%${t.discountPct} indirim` }));
}

export const VAT_PCT = DEFAULT_PRICING_SETTINGS.vatPct;

/**
 * Fixed weekday daytime pickup (Tue 2026-10-13 10:00 Istanbul) so sample prices never carry
 * night/Sunday/holiday surcharges and stay stable across builds.
 */
const SAMPLE_PICKUP_AT = new Date("2026-10-13T07:00:00Z");

export interface ExampleRoute {
  title: string;
  detail: string;
  quote: PriceQuote;
}

/** Three illustrative quotes computed with the real price function (distances are examples, not real routes). */
export function exampleRoutes(s: PricingSettings = DEFAULT_PRICING_SETTINGS): ExampleRoute[] {
  const q = (km: number, serviceLevel: ServiceLevel, extra: { roundTrip?: boolean; bridgeCrossings?: number } = {}) =>
    calculatePrice({ distanceMeters: km * 1000, serviceLevel, pickupAt: SAMPLE_PICKUP_AT, ...extra }, s);
  return [
    { title: "Kısa şehir içi", detail: "5 km · standart · aynı yaka", quote: q(5, "standart") },
    { title: "Acil evrak", detail: "12 km · acil (60 dk) · aynı yaka", quote: q(12, "acil") },
    {
      title: "Karşı yakaya imza turu",
      detail: "15 km · standart · Anadolu → Avrupa, gidiş-dönüş",
      quote: q(15, "standart", { roundTrip: true, bridgeCrossings: 1 }),
    },
  ];
}

/**
 * Sample month-end corporate invoice built with calculateMonthlyInvoice: a month just above the first
 * tier, mostly same-side 8 km jobs plus a few bridge crossings (bridge stays undiscounted).
 */
export function sampleMonthlyInvoice(s: PricingSettings = DEFAULT_PRICING_SETTINGS) {
  const tier = [...s.corporateTiers].sort((a, b) => a.minDeliveries - b.minDeliveries)[0];
  const count = (tier?.minDeliveries ?? 20) + 4;
  const bridgeJobs = 4;
  const local = calculatePrice({ distanceMeters: 8000, serviceLevel: "standart", pickupAt: SAMPLE_PICKUP_AT }, s);
  const cross = calculatePrice({ distanceMeters: 12000, serviceLevel: "standart", pickupAt: SAMPLE_PICKUP_AT, bridgeCrossings: 1 }, s);
  const items = [
    ...Array.from({ length: count - bridgeJobs }, () => monthlyInvoiceItem(local.subtotalKurus, local)),
    ...Array.from({ length: bridgeJobs }, () => monthlyInvoiceItem(cross.subtotalKurus, cross)),
  ];
  const inv = calculateMonthlyInvoice(items, s);
  const discountable = items.reduce((sum, i) => sum + (i.discountableKurus ?? i.subtotalKurus), 0);
  return {
    ...inv,
    bridgeJobs,
    discountableKurus: discountable,
    undiscountedKurus: inv.grossSubtotalKurus - discountable,
  };
}
