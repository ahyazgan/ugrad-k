/**
 * Kurye performans puanı (0–100): son 30 günün sayılarından (courier_performance_stats).
 * Bileşenler ve ağırlıklar: teklif kabul %25, acil taahhüt %20, müşteri puanı %20,
 * işi bırakmadan tamamlama %15, vardiya planına uyum %20. Az verili bileşen hesaba girmez;
 * toplam ağırlığın %40'ından azı ölçülebiliyorsa puan verilmez ("yeni").
 * Otomatik atamada yüksek puanlı kurye birkaç km avantaj alır (performanceBonusKm).
 */
export interface PerformanceStats {
  offersAccepted: number;
  offersDeclined: number;
  offersTimedOut: number;
  delivered: number;
  urgentDelivered: number;
  urgentOnTime: number;
  ratingCount: number;
  ratingAvg: number | null;
  released: number;
  failedDeliveries: number;
  shiftsBooked: number;
  shiftsAttended: number;
  lateCancels: number;
}

export type PerformanceTier = "altin" | "gumus" | "gelismeli" | "riskli" | "yeni";

export const PERFORMANCE_TIERS: Record<PerformanceTier, string> = {
  altin: "Altın",
  gumus: "Gümüş",
  gelismeli: "Gelişmeli",
  riskli: "Riskli",
  yeni: "Yeni (yeterli veri yok)",
};

export interface PerformancePart {
  key: "acceptance" | "onTime" | "rating" | "completion" | "attendance";
  label: string;
  weight: number;
  /** 0–1; az veride null */
  value: number | null;
  /** "12/15 (%80)" gibi */
  detail: string;
}

export interface PerformanceScore {
  score: number | null;
  tier: PerformanceTier;
  parts: PerformancePart[];
}

/** Bileşenin hesaba girmesi için en az kayıt */
const MIN = { offers: 5, urgent: 3, ratings: 3, jobs: 5, shifts: 3 } as const;

const pctText = (num: number, den: number) => `${num}/${den}${den ? ` (%${Math.round((num / den) * 100)})` : ""}`;

export function courierPerformance(s: PerformanceStats): PerformanceScore {
  const offers = s.offersAccepted + s.offersDeclined + s.offersTimedOut;
  const jobs = s.delivered + s.released;
  const planned = s.shiftsBooked + s.lateCancels;
  const parts: PerformancePart[] = [
    {
      key: "acceptance",
      label: "Teklif kabul",
      weight: 25,
      value: offers >= MIN.offers ? s.offersAccepted / offers : null,
      detail: `${pctText(s.offersAccepted, offers)}${s.offersTimedOut ? ` · ${s.offersTimedOut} yanıtsız` : ""}`,
    },
    {
      key: "onTime",
      label: "Acil taahhüt",
      weight: 20,
      value: s.urgentDelivered >= MIN.urgent ? s.urgentOnTime / s.urgentDelivered : null,
      detail: pctText(s.urgentOnTime, s.urgentDelivered),
    },
    {
      key: "rating",
      label: "Müşteri puanı",
      weight: 20,
      value: s.ratingCount >= MIN.ratings && s.ratingAvg != null ? (s.ratingAvg - 1) / 4 : null,
      detail: s.ratingCount ? `${s.ratingAvg?.toLocaleString("tr-TR")} / 5 (${s.ratingCount} puan)` : "puan yok",
    },
    {
      key: "completion",
      label: "Aldığı işi tamamlama",
      weight: 15,
      value: jobs >= MIN.jobs ? s.delivered / jobs : null,
      detail: `${pctText(s.delivered, jobs)}${s.released ? ` · ${s.released} iş bırakıldı` : ""}`,
    },
    {
      key: "attendance",
      label: "Vardiya planına uyum",
      weight: 20,
      value: planned >= MIN.shifts ? s.shiftsAttended / planned : null,
      detail: `${pctText(s.shiftsAttended, planned)}${s.lateCancels ? ` · ${s.lateCancels} geç iptal` : ""}`,
    },
  ];
  const measured = parts.filter((p) => p.value != null);
  const weight = measured.reduce((t, p) => t + p.weight, 0);
  if (weight < 40) return { score: null, tier: "yeni", parts };
  const score = Math.round((measured.reduce((t, p) => t + p.value! * p.weight, 0) / weight) * 100);
  const tier: PerformanceTier = score >= 85 ? "altin" : score >= 70 ? "gumus" : score >= 50 ? "gelismeli" : "riskli";
  return { score, tier, parts };
}

/** Otomatik atamada puana göre km avantajı: 70 nötr, her 10 puan 1 km, en fazla ±3 km */
export function performanceBonusKm(score: number | null | undefined): number {
  if (score == null) return 0;
  return Math.max(-3, Math.min(3, (score - 70) / 10));
}

/** Veritabanı satırından (snake_case) */
export function performanceStatsFromRow(r: Record<string, unknown>): PerformanceStats {
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    offersAccepted: n("offers_accepted"),
    offersDeclined: n("offers_declined"),
    offersTimedOut: n("offers_timed_out"),
    delivered: n("delivered"),
    urgentDelivered: n("urgent_delivered"),
    urgentOnTime: n("urgent_on_time"),
    ratingCount: n("rating_count"),
    ratingAvg: r.rating_avg == null ? null : Number(r.rating_avg),
    released: n("released"),
    failedDeliveries: n("failed_deliveries"),
    shiftsBooked: n("shifts_booked"),
    shiftsAttended: n("shifts_attended"),
    lateCancels: n("late_cancels"),
  };
}
