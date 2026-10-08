import { ageLabel } from "@yazgan/shared";
import { fmtDateTime } from "@/lib/dates";
import type { AdminOrder, ShiftBooking, ShiftTemplate } from "@/lib/repo/types";

/** Minutes before the urgent-delivery promise when an order counts as "at risk" */
export const SLA_RISK_MINUTES = 15;

const OPEN = new Set(["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda", "sorunlu"]);

/** Open urgent order whose promise is due within SLA_RISK_MINUTES (or already late) */
export function isSlaRisk(o: Pick<AdminOrder, "slaDueAt" | "status" | "deliveredAt">, now = Date.now()) {
  if (!o.slaDueAt || o.deliveredAt || !OPEN.has(o.status)) return false;
  return new Date(o.slaDueAt).getTime() - now <= SLA_RISK_MINUTES * 60_000;
}

/** Waiting for a courier longer than the alert threshold (scheduled orders count from pickup time) */
export function isUnassignedTooLong(o: Pick<AdminOrder, "status" | "createdAt" | "scheduledPickupAt">, minutes: number, now = Date.now()) {
  if (o.status !== "beklemede" && o.status !== "onaylandi") return false;
  const ref = new Date(o.scheduledPickupAt ?? o.createdAt).getTime();
  return now - ref > minutes * 60_000;
}

export interface CoverageSlot {
  templateId: number;
  start: string;
  end: string;
  required: number;
  booked: number;
  names: string[];
}

/** ISO weekday (1 = Monday … 7 = Sunday) of an Istanbul calendar day */
export const isoWeekday = (ymd: string) => ((new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** Shift-plan coverage of one day: booked / required per slot and in total (over-booking does not count) */
export function dayCoverage(templates: ShiftTemplate[], bookings: ShiftBooking[], ymd: string) {
  const dow = isoWeekday(ymd);
  const slots: CoverageSlot[] = templates
    .filter((t) => t.active && t.weekday === dow)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((t) => {
      const mine = bookings.filter((b) => b.templateId === t.id && !b.cancelledAt);
      return { templateId: t.id, start: t.startTime, end: t.endTime, required: t.required, booked: mine.length, names: mine.map((b) => b.courierName ?? "Kurye") };
    });
  const required = slots.reduce((s, x) => s + x.required, 0);
  const filled = slots.reduce((s, x) => s + Math.min(x.booked, x.required), 0);
  return { slots, required, filled, pct: required ? Math.round((filled / required) * 100) : null };
}


/** "3 dk önce" for the last 24 hours, otherwise the full date/time */
export function recentOrDate(iso: string, now = Date.now()) {
  return now - new Date(iso).getTime() < 86_400_000 ? ageLabel(iso, new Date(now)) : fmtDateTime(iso);
}
