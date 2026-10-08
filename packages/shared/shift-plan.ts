/**
 * Vardiya planlama: dilim etiketleri, katılım (planlanan dilim ↔ gerçek vardiya) ve doluluk.
 * Veritabanı: shift_templates, shift_bookings, shift_slots(); gerçek vardiya courier_shifts.
 */
import { istanbulTime } from "./eta.ts";

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Pazartesi",
  2: "Salı",
  3: "Çarşamba",
  4: "Perşembe",
  5: "Cuma",
  6: "Cumartesi",
  7: "Pazar",
};

/** "08:00–12:00" (gece yarısı biten dilim 24:00 yazılır) */
export function slotLabel(startsAt: string, endsAt: string): string {
  const end = istanbulTime(endsAt);
  return `${istanbulTime(startsAt)}–${end === "00:00" ? "24:00" : end}`;
}

/** Dilimin en az bu oranı vardiyada geçtiyse "geldi" */
export const ATTENDANCE_MIN_RATIO = 0.5;

export type AttendanceStatus = "bekliyor" | "geldi" | "gelmedi" | "iptal" | "gec_iptal";

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  bekliyor: "Bekliyor",
  geldi: "Geldi",
  gelmedi: "Gelmedi",
  iptal: "İptal",
  gec_iptal: "Geç iptal",
};

export interface PlannedShift {
  startsAt: string;
  endsAt: string;
  cancelledAt: string | null;
  lateCancel: boolean;
}

export interface WorkedShift {
  startedAt: string;
  endedAt: string | null;
}

/** Planlanan dilimde gerçekten çalışıldı mı; geç kalma dakikası */
export function attendance(
  b: PlannedShift,
  worked: WorkedShift[],
  now: Date = new Date(),
): { status: AttendanceStatus; overlapMinutes: number; lateMinutes: number | null } {
  if (b.cancelledAt) return { status: b.lateCancel ? "gec_iptal" : "iptal", overlapMinutes: 0, lateMinutes: null };
  const s = new Date(b.startsAt).getTime();
  const e = new Date(b.endsAt).getTime();
  const until = Math.min(e, now.getTime());
  let overlap = 0;
  let firstStart: number | null = null;
  for (const w of worked) {
    const ws = new Date(w.startedAt).getTime();
    const we = w.endedAt ? new Date(w.endedAt).getTime() : now.getTime();
    const o = Math.min(we, e) - Math.max(ws, s);
    if (o > 0) {
      overlap += o;
      firstStart = Math.min(firstStart ?? Infinity, Math.max(ws, s));
    }
  }
  const overlapMinutes = Math.round(overlap / 60_000);
  const lateMinutes = firstStart != null ? Math.max(0, Math.round((firstStart - s) / 60_000)) : null;
  if (now.getTime() < s) return { status: "bekliyor", overlapMinutes, lateMinutes };
  if (now.getTime() < e) {
    // Dilim sürüyor: vardiya açtıysa geldi, 15 dk geçtiyse ve açmadıysa gelmedi
    if (overlap > 0) return { status: "geldi", overlapMinutes, lateMinutes };
    return { status: now.getTime() - s > 15 * 60_000 ? "gelmedi" : "bekliyor", overlapMinutes, lateMinutes };
  }
  return { status: overlap >= (e - s) * ATTENDANCE_MIN_RATIO ? "geldi" : "gelmedi", overlapMinutes, lateMinutes: until >= s ? lateMinutes : null };
}

export interface SlotCoverage {
  required: number;
  booked: number;
}

/** Doluluk: eksik (gereken − alınan, ≥0) ve renk sınıfı */
export function coverageState(c: SlotCoverage): { missing: number; state: "tamam" | "eksik" | "bos" | "gereksiz" } {
  if (c.required === 0) return { missing: 0, state: "gereksiz" };
  const missing = Math.max(0, c.required - c.booked);
  return { missing, state: missing === 0 ? "tamam" : c.booked === 0 ? "bos" : "eksik" };
}
