// Tüm tarih hesapları İstanbul saatine göre (UTC+3, yaz saati yok).
const OFFSET_MS = 3 * 3600_000;
export const TZ = "Europe/Istanbul";

/** İstanbul yerel tarihi (YYYY-MM-DD) */
export const istDate = (d: Date | string = new Date()) =>
  new Date(new Date(d).getTime() + OFFSET_MS).toISOString().slice(0, 10);

/** İstanbul gününün başlangıcı (UTC ISO) */
export const istDayStartUtc = (ymd: string) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() - OFFSET_MS).toISOString();

/** İstanbul gününün bitişi (ertesi gün 00:00, UTC ISO) */
export const istDayEndUtc = (ymd: string) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() - OFFSET_MS + 86_400_000).toISOString();

/** "2026-10" → [ayın ilk günü, sonraki ayın ilk günü) UTC ISO */
export function istMonthRangeUtc(month: string): [string, string] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const start = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return [istDayStartUtc(start), istDayStartUtc(next)];
}

export const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }) : "—";

export const hoursBetween = (a: string, b: string | null, now = new Date()) =>
  ((b ? new Date(b) : now).getTime() - new Date(a).getTime()) / 3_600_000;
