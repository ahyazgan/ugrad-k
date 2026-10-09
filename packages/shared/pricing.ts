/**
 * Fiyat hesabı — TEK KAYNAK.
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

/**
 * Hizmet seviyesi: ekonomi (gün içi, indirimli), standart, acil (60 dk, ek ücretli).
 * Eski `urgent: true` alanı "acil" demektir.
 */
export type ServiceLevel = "ekonomi" | "standart" | "acil";
export const SERVICE_LEVELS: ServiceLevel[] = ["ekonomi", "standart", "acil"];
export const SERVICE_LEVEL_LABELS: Record<ServiceLevel, string> = {
  ekonomi: "Ekonomi (gün içi)",
  standart: "Standart",
  acil: "Acil (60 dk)",
};

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
  /** Ekonomi (gün içi) indirimi, % */
  economyDiscountPct: number;
  /** Ekonomi seçeneği alış saati bu saatten önce olmalı (yerel saat); gece, Pazar ve tatilde yok */
  economyCutoffHour: number;
  /** Gece ek ücreti (nightStartHour–nightEndHour) */
  nightSurchargePct: number;
  /** Pazar günü ek ücreti */
  sundaySurchargePct: number;
  /**
   * Resmi tatil (arifede halfDayStartHour sonrası) ek ücreti. (Alan adı tarihsel: eskiden gece ile ortaktı.)
   * Gece, Pazar ve tatil aynı anda olursa toplanmaz; en yükseği uygulanır.
   */
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
  /** Motosikletle taşınabilecek en fazla ağırlık (kg); null = sınırsız */
  maxWeightKg: number | null;
  /** Ücretli köprü/tünel geçişi başına eklenen tutar */
  bridgeFeeKurus: number;
  /** Kurye merkezi (uzak alış ücretinin ölçüldüğü nokta) */
  serviceCenterLat: number;
  serviceCenterLng: number;
  /** Merkezden bu kadar yol-km'ye kadar alış ücretsiz */
  freePickupRadiusKm: number;
  /** Değer beyanı olmadan sorumluluk sınırı; beyan bunun üstündeki kısım için sigortalanır */
  freeCoverageKurus: number;
  /** Beyan edilen değerin sigortalanan kısmına uygulanan oran (%) */
  insuranceRatePct: number;
  /** En düşük sigorta ücreti */
  insuranceMinKurus: number;
  /** Kabul edilen en yüksek beyan; null = sınırsız */
  maxDeclaredValueKurus: number | null;
  /** Ücretsiz yarıçapın dışındaki her yol-km için konumlanma ücreti (0 = kapalı) */
  remotePickupPerKmKurus: number;
  /** Uzak alış ücretinin üst sınırı */
  remotePickupMaxKurus: number;
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
  // 2026-10-10 algoritma v2 (docs/fiyat-arastirmasi.md §8)
  economyDiscountPct: 25,
  economyCutoffHour: 14,
  nightSurchargePct: 50,
  sundaySurchargePct: 50,
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
  maxWeightKg: 20,
  bridgeFeeKurus: 2_500,
  // Merkez: Kılıçlı Mah., Beykoz
  serviceCenterLat: 41.1295,
  serviceCenterLng: 29.1135,
  freePickupRadiusKm: 40,
  remotePickupPerKmKurus: 1_000,
  remotePickupMaxKurus: 30_000,
  // Değer beyanı: 1.000 TL'ye kadar sorumluluk ücretsiz, üstü %0,5 (en az 25 TL), en fazla 100.000 TL
  freeCoverageKurus: 100_000,
  insuranceRatePct: 0.5,
  insuranceMinKurus: 2_500,
  maxDeclaredValueKurus: 10_000_000,
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
  /** Hizmet seviyesi; verilmezse `urgent` alanından türetilir */
  serviceLevel?: ServiceLevel;
  /** Eski alan: true = acil */
  urgent?: boolean;
  /** Alış noktası (uzak alış ücreti için) */
  pickupPoint?: { lat: number; lng: number };
  /** Alış zamanı; verilmezse "şimdi" */
  pickupAt?: Date;
  weightKg?: number;
  /** Ağırlıktan bağımsız büyük paket işareti */
  largePackage?: boolean;
  /** Ücretli köprü/tünel geçiş sayısı (gidiş + dönüş toplamı) */
  bridgeCrossings?: number;
  /** Alışta beklenen dakika (teslimattan sonra gerçek süreyle yeniden hesaplanır) */
  waitingMinutes?: number;
  /** Müşterinin beyan ettiği gönderi değeri (kuruş) */
  declaredValueKurus?: number | null;
  holidays?: Holiday[];
}

export type PriceLineCode =
  | "base"
  | "extra_km"
  | "urgent"
  | "economy"
  | "night_holiday"
  | "remote_pickup"
  | "heavy"
  | "return_leg"
  | "waiting"
  | "bridge"
  /** Değer beyanı sigortası */
  | "insurance"
  /** Önceki gecikmeli acil teslimin telafisi (eksi tutar) */
  | "credit"
  /** Kampanya veya davet indirimi (eksi tutar) */
  | "promo"
  /** Teslim edilemeyen gönderinin göndericiye iadesi (dönüş ayağı kuralı) */
  | "failed_return";

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
    serviceLevel?: ServiceLevel;
    /** Uygulanan zaman eki türü */
    timeSurcharge?: "night" | "sunday" | "holiday" | null;
    /** Merkeze tahmini yol-km (uzak alış hesabı için) */
    pickupFromCenterKm?: number | null;
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

export type TimeSurchargeKind = "night" | "sunday" | "holiday";

/**
 * Alış anındaki zaman eki: gece, Pazar ve resmi tatil toplanmaz, en yüksek oran uygulanır
 * (eşitlikte tatil > Pazar > gece adı gösterilir).
 */
export function timeSurchargeAt(at: Date, settings: PricingSettings, holidays: Holiday[] = []) {
  const { date, hour } = toLocal(at, settings);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Pazar
  const holiday = holidays.find((h) => h.date === date && (!h.halfDay || hour >= settings.halfDayStartHour));
  const candidates: Array<{ kind: TimeSurchargeKind; pct: number }> = [];
  if (holiday) candidates.push({ kind: "holiday", pct: settings.nightHolidaySurchargePct });
  if (weekday === 0) candidates.push({ kind: "sunday", pct: settings.sundaySurchargePct });
  if (isNightHour(hour, settings)) candidates.push({ kind: "night", pct: settings.nightSurchargePct });
  const best = candidates.reduce<{ kind: TimeSurchargeKind; pct: number } | null>((b, c) => (!b || c.pct > b.pct ? c : b), null);
  return {
    kind: best && best.pct > 0 ? best.kind : null,
    pct: best?.pct ?? 0,
    holidayName: holiday?.name ?? null,
    /** Gece, Pazar veya tatil mi (ekonomi seçeneği için) */
    offHours: candidates.length > 0,
    hour,
  };
}

/** Ekonomi (gün içi) seçeneği bu alış zamanında kullanılabilir mi */
export function economyAvailableAt(at: Date, settings: PricingSettings, holidays: Holiday[] = []): boolean {
  const t = timeSurchargeAt(at, settings, holidays);
  return !t.offHours && t.hour < settings.economyCutoffHour;
}

/** Hizmet seviyesinin yüzde etkisi: acil +, ekonomi − */
export function serviceLevelPct(level: ServiceLevel, settings: PricingSettings): number {
  return level === "acil" ? settings.urgentSurchargePct : level === "ekonomi" ? -settings.economyDiscountPct : 0;
}

/**
 * Değer beyanı sigortası: beyanın ücretsiz sorumluluk sınırını aşan kısmının yüzdesi (en az insuranceMinKurus).
 * Beyan üst sınırı aşarsa PricingError.
 */
export function insuranceFeeKurus(declaredKurus: number | null | undefined, settings: PricingSettings = DEFAULT_PRICING_SETTINGS): number {
  if (!declaredKurus || declaredKurus <= 0) return 0;
  if (settings.maxDeclaredValueKurus != null && declaredKurus > settings.maxDeclaredValueKurus) {
    throw new PricingError(
      `En fazla ${formatTL(settings.maxDeclaredValueKurus)} değerinde gönderi taşıyoruz; daha değerli gönderiler için bizi arayın`,
    );
  }
  const insured = declaredKurus - settings.freeCoverageKurus;
  if (insured <= 0) return 0;
  return Math.max(settings.insuranceMinKurus, Math.ceil((insured * settings.insuranceRatePct) / 100 / 100) * 100);
}

/** Merkezden alış noktasına tahmini yol-km (kuş uçuşu × 1,35) ve uzak alış ücreti */
export function remotePickupFee(point: { lat: number; lng: number } | undefined, settings: PricingSettings) {
  if (!point) return { km: null, feeKurus: 0, billableKm: 0 };
  const R = 6_371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(point.lat - settings.serviceCenterLat);
  const dLng = toRad(point.lng - settings.serviceCenterLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(settings.serviceCenterLat)) * Math.cos(toRad(point.lat)) * Math.sin(dLng / 2) ** 2;
  const km = Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.35 * 10) / 10;
  const billableKm = Math.max(0, Math.ceil(km - settings.freePickupRadiusKm));
  const feeKurus = settings.remotePickupPerKmKurus > 0 ? Math.min(settings.remotePickupMaxKurus, billableKm * settings.remotePickupPerKmKurus) : 0;
  return { km, feeKurus, billableKm };
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

/**
 * Acil ve zaman eki yüzdeleri; toplam tavanı aşarsa zaman eki payı kırpılır.
 * `nightOrHoliday` true ise zaman eki oranı `timePct` (verilmezse tatil oranı) kabul edilir.
 */
export function surchargePercents(urgent: boolean, nightOrHoliday: boolean, settings: PricingSettings, timePct?: number) {
  const urgentPct = urgent ? settings.urgentSurchargePct : 0;
  const rawNightPct = nightOrHoliday ? (timePct ?? settings.nightHolidaySurchargePct) : 0;
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
  const level: ServiceLevel = input.serviceLevel ?? (input.urgent ? "acil" : "standart");
  const at = input.pickupAt ?? new Date();

  if (settings.maxWeightKg != null && (input.weightKg ?? 0) > settings.maxWeightKg) {
    throw new PricingError(`${settings.maxWeightKg} kg üzeri gönderiler motosikletle taşınamaz`);
  }
  const time = timeSurchargeAt(at, settings, input.holidays);
  if (level === "ekonomi" && !economyAvailableAt(at, settings, input.holidays)) {
    throw new PricingError(
      `Ekonomi gönderi yalnızca Pazartesi–Cumartesi ${String(settings.nightEndHour).padStart(2, "0")}:00–${String(settings.economyCutoffHour).padStart(2, "0")}:00 arası alışlarda kullanılabilir`,
    );
  }
  const nightOrHoliday = time.kind !== null;
  const holidayName = time.kind === "holiday" ? time.holidayName : null;
  // Acil ve zaman eki toplanır; toplam tavanı (maxSurchargePct) aşamaz. Ekonomi indirimi eksi yüzde olarak işler.
  const { urgentPct, nightPct, capped } = surchargePercents(level === "acil", nightOrHoliday, settings, time.pct);
  const economyPct = level === "ekonomi" ? settings.economyDiscountPct : 0;
  const surchargePct = urgentPct + nightPct - economyPct;
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
  if (economyPct > 0) {
    lines.push({
      code: "economy",
      label: `Ekonomi – gün içi teslim (−%${economyPct})`,
      amountKurus: -pct(outboundDistance, economyPct),
    });
  }
  if (level === "acil") {
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
      label:
        time.kind === "holiday"
          ? `Resmi tatil – ${holidayName} (+%${nightPct}${capNote})`
          : time.kind === "sunday"
            ? `Pazar teslimatı (+%${nightPct}${capNote})`
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

  const remote = remotePickupFee(input.pickupPoint, settings);
  if (remote.feeKurus > 0) {
    lines.push({
      code: "remote_pickup",
      label: `Uzak alış (merkeze ~${Math.round(remote.km!)} km, ${remote.billableKm} km × ${tl(settings.remotePickupPerKmKurus)} TL${
        remote.feeKurus === settings.remotePickupMaxKurus ? ", üst sınır" : ""
      })`,
      amountKurus: remote.feeKurus,
    });
  }

  const insurance = insuranceFeeKurus(input.declaredValueKurus, settings);
  if (insurance > 0) {
    lines.push({
      code: "insurance",
      label: `Değer beyanı sigortası (${tl(input.declaredValueKurus!)} TL beyan, ${tl(settings.freeCoverageKurus)} TL üstü %${settings.insuranceRatePct.toLocaleString("tr-TR")})`,
      amountKurus: insurance,
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
    meta: {
      distanceKm: km,
      returnDistanceKm: returnKm,
      nightOrHoliday,
      holidayName,
      surchargePct,
      serviceLevel: level,
      timeSurcharge: time.kind,
      pickupFromCenterKm: remote.km,
    },
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

/** Kurumsal indirime tabi kalemler (taşıma bedeli). Köprü, bekleme, ağır paket ve uzak alış indirimsizdir. */
export const DISCOUNTABLE_LINE_CODES: PriceLineCode[] = [
  "base",
  "extra_km",
  "economy",
  "urgent",
  "night_holiday",
  "return_leg",
  "failed_return",
  "promo",
];

export function discountableKurus(quote: Pick<PriceQuote, "lines">): number {
  return quote.lines.filter((l) => DISCOUNTABLE_LINE_CODES.includes(l.code)).reduce((s, l) => s + l.amountKurus, 0);
}

export interface MonthlyInvoiceItem {
  subtotalKurus: number;
  /** İndirime tabi kısım (verilmezse tamamı) */
  discountableKurus?: number;
}

/**
 * Müşteri kredisini (ör. acil taahhüt telafisi) teklife eksi satır olarak ekler; ara toplamı sıfırın altına indirmez.
 * Dönen `usedKurus` kullanılan kredi tutarıdır.
 */
export function applyCredit(quote: PriceQuote, creditKurus: number, label: string, code: "credit" | "promo" = "credit"): { quote: PriceQuote; usedKurus: number } {
  const used = Math.max(0, Math.min(Math.round(creditKurus), quote.subtotalKurus));
  if (used === 0) return { quote, usedKurus: 0 };
  const lines = [...quote.lines, { code, label, amountKurus: -used }];
  const subtotalKurus = quote.subtotalKurus - used;
  const vatPct = quote.subtotalKurus > 0 ? Math.round((quote.vatKurus / quote.subtotalKurus) * 10_000) / 100 : DEFAULT_PRICING_SETTINGS.vatPct;
  const vatKurus = pct(subtotalKurus, vatPct);
  return { quote: { ...quote, lines, subtotalKurus, vatKurus, totalKurus: subtotalKurus + vatKurus }, usedKurus: used };
}

/** Acil teslim ek ücreti (taahhüt kaçarsa telafi edilen tutar) */
export const urgentSurchargeKurus = (quote: Pick<PriceQuote, "lines">) =>
  quote.lines.filter((l) => l.code === "urgent").reduce((s, l) => s + l.amountKurus, 0);

/** Siparişin kayıtlı teklifinden fatura kalemi (teklif yoksa tamamı indirime tabi sayılır) */
export function monthlyInvoiceItem(subtotalKurus: number, quote?: Pick<PriceQuote, "lines"> | null): MonthlyInvoiceItem {
  return quote?.lines ? { subtotalKurus, discountableKurus: discountableKurus(quote) } : { subtotalKurus };
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
 * Kurumsal müşterinin ay sonu tek faturası. İndirim, ay içinde teslim edilen siparişlerin
 * KDV hariç taşıma bedeline (DISCOUNTABLE_LINE_CODES) uygulanır; köprü, bekleme, ağır paket ve
 * uzak alış indirimsizdir. Kademe o ayın teslimat sayısıyla belirlenir.
 */
export function calculateMonthlyInvoice(
  delivered: Array<number | MonthlyInvoiceItem>,
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS,
): MonthlyInvoice {
  const items = delivered.map((d) => (typeof d === "number" ? { subtotalKurus: d } : d));
  const deliveryCount = items.length;
  const grossSubtotalKurus = items.reduce((s, v) => s + v.subtotalKurus, 0);
  const discountBase = items.reduce((s, v) => s + Math.min(v.subtotalKurus, v.discountableKurus ?? v.subtotalKurus), 0);
  const discountPct = corporateTierFor(deliveryCount, settings)?.discountPct ?? 0;
  const discountKurus = pct(discountBase, discountPct);
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

/** Satırlar değişince toplamları yeniden hesaplar; KDV oranı teklifin kendisinden korunur (sipariş anındaki oran) */
function retotal(quote: PriceQuote, lines: PriceLine[], settings: PricingSettings): PriceQuote {
  const subtotalKurus = lines.reduce((s, l) => s + l.amountKurus, 0);
  const vatPct = quote.subtotalKurus > 0 ? Math.round((quote.vatKurus / quote.subtotalKurus) * 10_000) / 100 : settings.vatPct;
  const vatKurus = pct(subtotalKurus, vatPct);
  return { ...quote, lines, subtotalKurus, vatKurus, totalKurus: subtotalKurus + vatKurus };
}

/** Satırı köprü satırından önce (yoksa sona) ekler */
function insertBeforeBridge(lines: PriceLine[], line: PriceLine) {
  const bridgeIdx = lines.findIndex((l) => l.code === "bridge");
  lines.splice(bridgeIdx === -1 ? lines.length : bridgeIdx, 0, line);
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
    insertBeforeBridge(lines, {
      code: "waiting",
      label: `Bekleme (${waitingMinutes} dk, ilk ${settings.waitingFreeMinutes} dk ücretsiz)`,
      amountKurus: fee,
    });
  }
  return retotal(quote, lines, settings);
}

/** Gidişin ek ücretler dahil taşıma bedeli (dönüş ayağı bu tutar üzerinden hesaplanır) */
const OUTBOUND_TRANSPORT_CODES: PriceLineCode[] = ["base", "extra_km", "economy", "urgent", "night_holiday"];
/** İade dönüşündeki ek köprü geçişi satırının etiketi (yeniden hesapta tanınır) */
export const FAILED_RETURN_BRIDGE_LABEL = "Köprü / tünel geçişi (iade dönüşü)";

/**
 * Teslim edilemeyen gönderinin göndericiye iadesi. Gidiş-dönüş kuralıyla aynı: dönüş ayağı, gidişin
 * ek ücretler dahil taşıma bedelinin %(100 − returnLegDiscountPct)'i. Sipariş zaten gidiş-dönüşse dönüş
 * ayağı alınmıştır, ek ücret yok. Dönüşte ücretli köprü yönüne (Anadolu→Avrupa) geçiliyorsa
 * `extraBridgeCrossings` kadar geçiş eklenir. Kuryenin dönüş km'si hakedişe girsin diye meta güncellenir.
 * Tekrar çağrılırsa önceki iade satırları değiştirilir (idempotent).
 */
export function applyFailedDeliveryReturn(
  quote: PriceQuote,
  opts: { roundTrip: boolean; extraBridgeCrossings?: number },
  settings: PricingSettings = DEFAULT_PRICING_SETTINGS,
): PriceQuote {
  const lines = quote.lines.filter((l) => l.code !== "failed_return" && !(l.code === "bridge" && l.label === FAILED_RETURN_BRIDGE_LABEL));
  if (opts.roundTrip) return retotal(quote, lines, settings);
  const outbound = lines.filter((l) => OUTBOUND_TRANSPORT_CODES.includes(l.code)).reduce((s, l) => s + l.amountKurus, 0);
  insertBeforeBridge(lines, {
    code: "failed_return",
    label: `Teslim edilemedi – göndericiye iade (dönüş ayağı, %${settings.returnLegDiscountPct} indirimli)`,
    amountKurus: outbound - pct(outbound, settings.returnLegDiscountPct),
  });
  const crossings = opts.extraBridgeCrossings ?? 0;
  if (crossings > 0 && settings.bridgeFeeKurus > 0) {
    lines.push({ code: "bridge", label: FAILED_RETURN_BRIDGE_LABEL, amountKurus: crossings * settings.bridgeFeeKurus });
  }
  const next = retotal(quote, lines, settings);
  return { ...next, meta: { ...quote.meta, returnDistanceKm: quote.meta.returnDistanceKm ?? quote.meta.distanceKm } };
}
