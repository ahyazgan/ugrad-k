/**
 * Kurye hedef primleri (courier_incentives): kademeli hedef (gün/hafta içinde N iş → ödül) veya
 * seçili gün/saatlerde hakedişe yüzde ek. Ödül dönem kapanınca hesaplanır (compute_incentive_awards).
 */
import { formatTL } from "./pricing.ts";

export interface IncentiveTier {
  target: number;
  rewardKurus: number;
}

export interface Incentive {
  title: string;
  kind: "hedef" | "yuzde";
  period: "gunluk" | "haftalik";
  tiers: IncentiveTier[];
  bonusPct: number | null;
  /** 1=Pzt … 7=Paz; null = her gün */
  weekdays: number[] | null;
  startHour: number;
  endHour: number;
  startsOn: string;
  endsOn: string | null;
}

/** Kısa gün adları (1=Pzt … 7=Paz); "Cuma" ile "Cumartesi" karışmasın diye açık liste */
export const WEEKDAY_SHORT: Record<number, string> = { 1: "Pzt", 2: "Sal", 3: "Çar", 4: "Per", 5: "Cum", 6: "Cmt", 7: "Paz" };

export const INCENTIVE_PERIODS: Record<Incentive["period"], string> = { gunluk: "Günlük", haftalik: "Haftalık" };

/** Kaydetmeden önce kural kontrolü; sorun yoksa null */
export function incentiveProblem(i: Incentive): string | null {
  if (i.title.trim().length < 3) return "Başlık en az 3 karakter olmalı";
  if (!(i.startHour >= 0 && i.endHour <= 24 && i.endHour > i.startHour)) return "Saat aralığı geçersiz";
  if (i.endsOn && i.endsOn < i.startsOn) return "Bitiş tarihi başlangıçtan önce olamaz";
  if (i.weekdays && (!i.weekdays.length || i.weekdays.some((d) => d < 1 || d > 7))) return "En az bir gün seçin";
  if (i.kind === "yuzde") return i.bonusPct != null && i.bonusPct >= 1 && i.bonusPct <= 100 ? null : "Prim yüzdesi 1–100 olmalı";
  if (!i.tiers.length) return "En az bir hedef kademesi girin";
  for (let k = 0; k < i.tiers.length; k++) {
    const t = i.tiers[k]!;
    if (!Number.isInteger(t.target) || t.target < 1 || !Number.isInteger(t.rewardKurus) || t.rewardKurus < 1) return "Hedef ve ödül pozitif olmalı";
    const prev = i.tiers[k - 1];
    if (prev && (t.target <= prev.target || t.rewardKurus <= prev.rewardKurus)) return "Kademeler artan sırada olmalı (daha büyük hedef, daha büyük ödül)";
  }
  return null;
}

/** "Hafta içi 08:00–20:00", "Cmt, Paz", "Her gün" */
export function incentiveScope(i: Pick<Incentive, "weekdays" | "startHour" | "endHour">): string {
  const days =
    !i.weekdays || i.weekdays.length === 7
      ? "Her gün"
      : [...i.weekdays].sort((a, b) => a - b).join(",") === "1,2,3,4,5"
        ? "Hafta içi"
        : [...i.weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]).join(", ");
  const hours = i.startHour === 0 && i.endHour === 24 ? "" : ` ${String(i.startHour).padStart(2, "0")}:00–${String(i.endHour).padStart(2, "0")}:00`;
  return days + hours;
}

export interface IncentiveProgress {
  /** Şu anki ilerlemeyle kazanılan */
  rewardKurus: number;
  /** Sonraki kademe ve kalan iş */
  next: (IncentiveTier & { remaining: number }) | null;
  text: string;
}

/** Bu dönemin ilerlemesi: hedefte iş sayısı, yüzde priminde kazanılan ek */
export function incentiveProgress(i: Pick<Incentive, "kind" | "tiers" | "bonusPct" | "period">, jobs: number, earningKurus: number): IncentiveProgress {
  const when = i.period === "gunluk" ? "bugün" : "bu hafta";
  if (i.kind === "yuzde") {
    const reward = incentiveAwardKurus(i, jobs, earningKurus);
    return { rewardKurus: reward, next: null, text: `${when} ${jobs} iş · +%${i.bonusPct} ile ${formatTL(reward)} ek` };
  }
  const reward = incentiveAwardKurus(i, jobs, earningKurus);
  const nextTier = i.tiers.find((t) => t.target > jobs);
  return {
    rewardKurus: reward,
    next: nextTier ? { ...nextTier, remaining: nextTier.target - jobs } : null,
    text: nextTier
      ? `${when} ${jobs}/${nextTier.target} iş · ${nextTier.target - jobs} iş daha → ${formatTL(nextTier.rewardKurus)}`
      : `${when} ${jobs} iş · en yüksek ödül kazanıldı: ${formatTL(reward)}`,
  };
}

const DAY_MS = 86_400_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** 1=Pzt … 7=Paz */
const isoWeekday = (ymd: string) => ((new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** İş, kampanyanın gün ve saat filtresine uyuyor mu (İstanbul saati, UTC+3) */
export function inIncentiveScope(i: Pick<Incentive, "weekdays" | "startHour" | "endHour">, completedAt: string | Date): boolean {
  const t = new Date(new Date(completedAt).getTime() + 3 * 3_600_000);
  const day = ((t.getUTCDay() + 6) % 7) + 1;
  const hour = t.getUTCHours();
  return (!i.weekdays || i.weekdays.includes(day)) && hour >= i.startHour && hour < i.endHour;
}

export interface IncentivePeriod {
  /** Dönemin kendisi (ödülün anahtarı) */
  periodStart: string;
  periodEnd: string;
  /** Kampanya tarih aralığıyla kesişen sayım aralığı */
  countFrom: string;
  countTo: string;
}

/** Kapanmış dönemler (son 14 gün; haftalık dönem Pazartesi başlar) — compute_incentive_awards ile aynı kural */
export function closedIncentivePeriods(i: Pick<Incentive, "period" | "startsOn" | "endsOn">, today: string): IncentivePeriod[] {
  const out: IncentivePeriod[] = [];
  let start = i.startsOn > addDays(today, -14) ? i.startsOn : addDays(today, -14);
  if (i.period === "haftalik") start = addDays(start, 1 - isoWeekday(start));
  while (start < today) {
    const end = i.period === "gunluk" ? start : addDays(start, 6);
    if (end >= today) break;
    if ((!i.endsOn || start <= i.endsOn) && end >= i.startsOn) {
      out.push({
        periodStart: start,
        periodEnd: end,
        countFrom: start > i.startsOn ? start : i.startsOn,
        countTo: i.endsOn && i.endsOn < end ? i.endsOn : end,
      });
    }
    start = addDays(end, 1);
  }
  return out;
}

/** Dönem ödülü: hedefte ulaşılan en yüksek kademe, yüzdede hakediş × % (kuruş, yuvarlanır) */
export function incentiveAwardKurus(i: Pick<Incentive, "kind" | "tiers" | "bonusPct">, jobs: number, earningKurus: number): number {
  if (i.kind === "yuzde") return Math.round((earningKurus * (i.bonusPct ?? 0)) / 100);
  return i.tiers.reduce((best, t) => (t.target <= jobs && t.rewardKurus > best ? t.rewardKurus : best), 0);
}
