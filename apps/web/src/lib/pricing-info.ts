import {
  calculateMonthlyInvoice,
  calculatePrice,
  countBridgeCrossings,
  formatTL,
  monthlyInvoiceItem,
  roadKm,
  type PriceQuote,
  type PricingSettings,
  type ServiceLevel,
} from "@yazgan/shared";

// Every number shown on the site is derived from the tariff passed in (live `pricing_settings` via
// getPricingSettings(), or the packages/shared/pricing.ts defaults in demo) and the shared price function.
// Never hard-code an amount, percentage or limit in page copy: add a helper here instead.

export interface TariffRow {
  label: string;
  value: string;
}

/** Whole-lira amounts read better in tables: "350,00 TL" → "350 TL" */
export const tl = (k: number) => formatTL(k).replace(",00 TL", " TL");
export const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const pct = (n: number) => n.toLocaleString("tr-TR");

/** The single customer-facing bridge rule (mirrors countBridgeCrossings in packages/shared/geo.ts). */
export function bridgeRuleText(s: PricingSettings): string {
  return `Alış veya teslim adresi Avrupa yakasındaysa siparişe bir kez köprü geçiş ücreti (+${tl(s.bridgeFeeKurus)}) eklenir.`;
}

/**
 * Economy pickup window, e.g. "Pazartesi–Cumartesi 07:00–14:00". Mirrors economyAvailableAt:
 * not night, Sunday or a public holiday, and before the cutoff hour.
 */
export function economyWindowText(s: PricingSettings, short = false): string {
  return `${short ? "Pzt–Cmt" : "Pazartesi–Cumartesi"} ${hh(s.nightEndHour)}–${hh(s.economyCutoffHour)}`;
}

/** "yarı fiyatına" when the return-leg discount is 50%, otherwise e.g. "%40 indirimli". */
export function returnLegPhrase(s: PricingSettings): string {
  return s.returnLegDiscountPct === 50 ? "yarı fiyatına" : `%${pct(s.returnLegDiscountPct)} indirimli`;
}

/** Corporate tiers sorted by threshold (smallest first). */
export function corporateTiers(s: PricingSettings) {
  return [...s.corporateTiers].sort((a, b) => a.minDeliveries - b.minDeliveries);
}

/** Opening fee + km tiers (the first lines of every receipt). */
export function baseRows(s: PricingSettings): TariffRow[] {
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

/** Tarife özetini (KDV hariç) okunur satırlara çevirir. */
export function pricingRows(s: PricingSettings): TariffRow[] {
  const g = tariffGroups(s);
  return [...g.base.rows, ...g.urgent.rows, ...g.time.rows, ...g.roundTrip.rows, ...g.road.rows, ...g.limits.rows];
}

export interface TariffGroup {
  title: string;
  rows: TariffRow[];
  notes: string[];
}

/** Tariff grouped for the three cards on /fiyatlar: base · surcharges (urgent, time, round trip, road) · limits. */
export function tariffGroups(s: PricingSettings) {
  const base: TariffGroup = {
    title: "Temel",
    rows: [
      ...baseRows(s),
      { label: "Standart: en kısa sürede teslim", value: "tarife" },
      { label: `Ekonomi: gün içinde teslim (${economyWindowText(s, true)} arası alış)`, value: `−%${pct(s.economyDiscountPct)}` },
    ],
    notes: ["Km, sürüş mesafesine göre yukarı yuvarlanır.", "Ekonomi gönderiler aynı gün içinde, uygun kurye rotasıyla teslim edilir."],
  };
  const urgent: TariffGroup = {
    title: "Acil",
    rows: [{ label: "Acil teslimat (60 dakika)", value: `+%${pct(s.urgentSurchargePct)}` }],
    notes: ["60 dakika taahhüdü: kaçırırsak acil ek ücreti sonraki siparişinizden düşülür."],
  };
  const time: TariffGroup = {
    title: "Gece, Pazar, tatil",
    rows: [
      { label: `Gece (${hh(s.nightStartHour)}–${hh(s.nightEndHour)})`, value: `+%${pct(s.nightSurchargePct)}` },
      { label: "Pazar", value: `+%${pct(s.sundaySurchargePct)}` },
      { label: `Resmi tatil (arife ${hh(s.halfDayStartHour)}'ten itibaren)`, value: `+%${pct(s.nightHolidaySurchargePct)}` },
      ...(s.maxSurchargePct != null ? [{ label: "Acil dahil ek ücretlerin toplamı en fazla", value: `%${pct(s.maxSurchargePct)}` }] : []),
    ],
    notes: ["Gece, Pazar ve tatil ekleri birlikte gelirse toplanmaz, yalnızca en yükseği uygulanır."],
  };
  const roundTrip: TariffGroup = {
    title: "Gidiş-dönüş ve bekleme",
    rows: [
      { label: "Gidiş-dönüş: dönüş ayağında indirim", value: `%${pct(s.returnLegDiscountPct)}` },
      { label: `Bekleme (ilk ${s.waitingFreeMinutes} dk ücretsiz), başlayan her ${s.waitingBlockMinutes} dk`, value: tl(s.waitingBlockFeeKurus) },
    ],
    notes: [`Dönüş ayağına, ek ücretler dahil gidiş fiyatı üzerinden %${pct(s.returnLegDiscountPct)} indirim uygulanır; köprü ücreti indirimsizdir.`],
  };
  const road: TariffGroup = {
    title: "Köprü ve uzak alış",
    rows: [
      { label: "Köprü geçişi (sipariş başına bir kez)", value: `+${tl(s.bridgeFeeKurus)}` },
      ...(s.remotePickupPerKmKurus > 0
        ? [
            {
              label: `Uzak alış: merkezimize ${s.freePickupRadiusKm} km'den uzak adreslerde km başına (en fazla ${tl(s.remotePickupMaxKurus)})`,
              value: `+${tl(s.remotePickupPerKmKurus)}`,
            },
          ]
        : []),
    ],
    notes: [bridgeRuleText(s)],
  };
  const limits: TariffGroup = {
    title: "Sınırlar",
    rows: [
      ...(s.maxWeightKg != null ? [{ label: "Motosikletle taşınabilen en fazla ağırlık", value: `${pct(s.maxWeightKg)} kg` }] : []),
      { label: `${pct(s.heavyThresholdKg)} kg üzeri / büyük paket`, value: `+${tl(s.heavySurchargeKurus)}` },
      {
        label: `Değer beyanı: ${tl(s.freeCoverageKurus)}'ye kadar ücretsiz güvence; üstü (en az ${tl(s.insuranceMinKurus)})`,
        value: `%${pct(s.insuranceRatePct)}`,
      },
      ...(s.maxDeclaredValueKurus != null ? [{ label: "Beyan edilebilecek en yüksek gönderi değeri", value: tl(s.maxDeclaredValueKurus) }] : []),
    ],
    notes: [],
  };
  return { base, urgent, time, roundTrip, road, limits };
}

export function corporateRows(s: PricingSettings) {
  return corporateTiers(s).map((t) => ({ label: `Ayda ${t.minDeliveries}+ teslimat`, value: `%${pct(t.discountPct)} indirim` }));
}

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
export function exampleRoutes(s: PricingSettings): ExampleRoute[] {
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
 * Estimated standard price from our service center (Beykoz, `serviceCenterLat/Lng`) to a district center for
 * the district pages. Distance uses the same straight-line × ROAD_FACTOR estimate as courier assignment
 * (`roadKm`); the page must label it as an estimate — the real price comes from the route of the actual addresses.
 */
export function districtEstimate(s: PricingSettings, district: { side: "anadolu" | "avrupa"; center: { lat: number; lng: number } }) {
  const km = Math.max(1, Math.ceil(roadKm({ lat: s.serviceCenterLat, lng: s.serviceCenterLng }, district.center)));
  const bridgeCrossings = countBridgeCrossings("anadolu", district.side);
  const quote = calculatePrice({ distanceMeters: km * 1000, serviceLevel: "standart", pickupAt: SAMPLE_PICKUP_AT, bridgeCrossings }, s);
  return { km, bridgeCrossings, quote };
}

/**
 * Sample month-end corporate invoice built with calculateMonthlyInvoice: a month just above the first
 * tier, mostly same-side 8 km jobs plus a few bridge crossings (bridge stays undiscounted).
 */
export function sampleMonthlyInvoice(s: PricingSettings) {
  const tier = corporateTiers(s)[0];
  const count = (tier?.minDeliveries ?? 20) + 4;
  const bridgeJobs = 4;
  const localKm = 8;
  const crossKm = 12;
  const local = calculatePrice({ distanceMeters: localKm * 1000, serviceLevel: "standart", pickupAt: SAMPLE_PICKUP_AT }, s);
  const cross = calculatePrice({ distanceMeters: crossKm * 1000, serviceLevel: "standart", pickupAt: SAMPLE_PICKUP_AT, bridgeCrossings: 1 }, s);
  const items = [
    ...Array.from({ length: count - bridgeJobs }, () => monthlyInvoiceItem(local.subtotalKurus, local)),
    ...Array.from({ length: bridgeJobs }, () => monthlyInvoiceItem(cross.subtotalKurus, cross)),
  ];
  const inv = calculateMonthlyInvoice(items, s);
  const discountable = items.reduce((sum, i) => sum + (i.discountableKurus ?? i.subtotalKurus), 0);
  return {
    ...inv,
    bridgeJobs,
    localKm,
    crossKm,
    discountableKurus: discountable,
    undiscountedKurus: inv.grossSubtotalKurus - discountable,
  };
}
