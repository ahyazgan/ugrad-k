/**
 * Talep yoğunluğu: geçmiş siparişlerin alış zamanı (İstanbul hafta günü × saat) ve ~1 km'lik alış hücresi.
 * Kaynak demand_stats RPC'si (ham koordinat değil hücre merkezi; kurye görünümünde az siparişli hücreler gizli).
 * Panel: ısı tablosu, sıcak bölgeler, vardiya önerisi. Kurye: önümüzdeki saatin yoğun bölgeleri.
 */
import { haversineMeters, type LatLng } from "./geo.ts";

/** Hücre boyu (derece): İstanbul enleminde ~1,1 km × ~1,1 km */
export const DEMAND_CELL = { lat: 0.01, lng: 0.013 } as const;
/** Kurye yalnız en az bu kadar siparişli hücreleri görür (tek bir müşterinin adresi seçilemesin) */
export const DEMAND_MIN_ORDERS_FOR_COURIER = 3;
/** Bir kuryenin saatte yetişebileceği iş (ortalama teslim ~60 dk + dönüş) */
export const DEFAULT_ORDERS_PER_COURIER_HOUR = 1.5;
/** Varsayılan geriye bakış */
export const DEFAULT_DEMAND_DAYS = 56;

export interface DemandRow {
  /** 1 = Pazartesi … 7 = Pazar (İstanbul) */
  weekday: number;
  hour: number;
  /** Hücre merkezi */
  lat: number;
  lng: number;
  orders: number;
  /** Hücredeki alış adreslerinde en sık geçen ilçe */
  district: string | null;
}

export interface DemandData {
  /** Ortalamanın paydası: verinin kapsadığı hafta sayısı (en az 1) */
  weeks: number;
  rows: DemandRow[];
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

// Kayan nokta: 41.02 / 0.01 = 4101.999… olmasın (veritabanı numeric ile tam bölünür)
const cellIndex = (v: number, size: number) => Math.floor(v / size + 1e-9);

/** Noktanın bulunduğu hücrenin merkezi (demand_stats ile aynı formül) */
export function demandCell(p: LatLng): LatLng {
  return {
    lat: round6((cellIndex(p.lat, DEMAND_CELL.lat) + 0.5) * DEMAND_CELL.lat),
    lng: round6((cellIndex(p.lng, DEMAND_CELL.lng) + 0.5) * DEMAND_CELL.lng),
  };
}

/** İstanbul saatiyle (UTC+3, yaz saati yok) hafta günü ve saat */
export function istanbulWeekHour(at: Date | string): { weekday: number; hour: number } {
  const t = new Date(new Date(at).getTime() + 3 * 3_600_000);
  return { weekday: ((t.getUTCDay() + 6) % 7) + 1, hour: t.getUTCHours() };
}

/** "…, 34820 Beykoz/İstanbul, Türkiye" → "Beykoz" */
export function districtFromAddress(address: string | null | undefined): string | null {
  return address?.match(/([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*\/\s*İstanbul/)?.[1] ?? null;
}

export interface DemandOrder {
  /** Planlı alış varsa o, yoksa sipariş anı */
  at: string;
  pickup: LatLng;
  pickupAddress: string | null;
  cancelled: boolean;
}

/** Siparişlerden talep verisi (demo ve testler; sunucuda demand_stats aynı kuralı uygular) */
export function aggregateDemand(
  orders: DemandOrder[],
  now: Date,
  opts: { days?: number; minOrders?: number } = {},
): DemandData {
  const days = Math.max(7, Math.min(opts.days ?? DEFAULT_DEMAND_DAYS, 365));
  const since = now.getTime() - days * 86_400_000;
  const groups = new Map<string, DemandRow & { names: Map<string, number> }>();
  let first = Infinity;
  for (const o of orders) {
    const t = new Date(o.at).getTime();
    if (o.cancelled || t < since || t >= now.getTime()) continue;
    first = Math.min(first, t);
    const { weekday, hour } = istanbulWeekHour(o.at);
    const c = demandCell(o.pickup);
    const key = `${weekday}|${hour}|${c.lat}|${c.lng}`;
    const g = groups.get(key) ?? { weekday, hour, ...c, orders: 0, district: null, names: new Map() };
    g.orders++;
    const d = districtFromAddress(o.pickupAddress);
    if (d) g.names.set(d, (g.names.get(d) ?? 0) + 1);
    groups.set(key, g);
  }
  const rows = [...groups.values()]
    .filter((g) => g.orders >= (opts.minOrders ?? 1))
    .map(({ names, ...g }) => ({ ...g, district: topKey(names) }));
  return { weeks: weeksCovered(first, since, now.getTime()), rows };
}

/** Verinin kapsadığı hafta: yeni işletmede ilk siparişten bu yana (ortalama eksik çıkmasın), en az 1 */
function weeksCovered(firstMs: number, sinceMs: number, nowMs: number): number {
  if (!Number.isFinite(firstMs)) return 1;
  return Math.max(1, Math.round(((nowMs - Math.max(firstMs, sinceMs)) / (7 * 86_400_000)) * 10) / 10);
}

function topKey(m: Map<string, number>): string | null {
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of m) if (v > n || (v === n && best != null && k < best)) [best, n] = [k, v];
  return best;
}

/** 7 × 24 tablo: haftalık ortalama sipariş ([hafta günü − 1][saat]) */
export function demandMatrix(data: DemandData): number[][] {
  const m = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const r of data.rows) m[r.weekday - 1]![r.hour]! += r.orders / data.weeks;
  return m;
}

export interface Hotspot extends LatLng {
  district: string | null;
  /** Seçilen saatlerde haftalık ortalama sipariş */
  perWeek: number;
  /** Seçilen saatlerdeki toplam içindeki pay (0–1) */
  share: number;
  /** En yoğun hücreye göre (0–1) */
  intensity: number;
  distanceKm?: number;
}

/** Hücre bazında yoğunluk; `when` verilirse yalnız o gün/saatler */
export function demandHotspots(
  data: DemandData,
  opts: { when?: (weekday: number, hour: number) => boolean; limit?: number; from?: LatLng } = {},
): Hotspot[] {
  const cells = new Map<string, { lat: number; lng: number; orders: number; names: Map<string, number> }>();
  let total = 0;
  for (const r of data.rows) {
    if (opts.when && !opts.when(r.weekday, r.hour)) continue;
    const key = `${r.lat}|${r.lng}`;
    const c = cells.get(key) ?? { lat: r.lat, lng: r.lng, orders: 0, names: new Map() };
    c.orders += r.orders;
    if (r.district) c.names.set(r.district, (c.names.get(r.district) ?? 0) + r.orders);
    cells.set(key, c);
    total += r.orders;
  }
  const max = Math.max(0, ...[...cells.values()].map((c) => c.orders));
  return [...cells.values()]
    .sort((a, b) => b.orders - a.orders || a.lat - b.lat || a.lng - b.lng)
    .slice(0, opts.limit ?? 10)
    .map((c) => ({
      lat: c.lat,
      lng: c.lng,
      district: topKey(c.names),
      perWeek: c.orders / data.weeks,
      share: total ? c.orders / total : 0,
      intensity: max ? c.orders / max : 0,
      ...(opts.from ? { distanceKm: Math.round(haversineMeters(opts.from, c) / 100) / 10 } : {}),
    }));
}

/** Kurye için: bu saat ve sonraki saatin yoğun bölgeleri (gece yarısında ertesi güne geçer) */
export function upcomingHotspots(data: DemandData, now: Date, opts: { limit?: number; from?: LatLng } = {}): Hotspot[] {
  const a = istanbulWeekHour(now);
  const b = istanbulWeekHour(new Date(now.getTime() + 3_600_000));
  return demandHotspots(data, {
    when: (w, h) => (w === a.weekday && h === a.hour) || (w === b.weekday && h === b.hour),
    limit: opts.limit ?? 3,
    from: opts.from,
  });
}

export interface ShiftSlotTemplate {
  id: number;
  weekday: number;
  /** "08:00" */
  startTime: string;
  /** "12:00" veya "24:00" */
  endTime: string;
  required: number;
  active: boolean;
}

export interface StaffingAdvice {
  templateId: number;
  weekday: number;
  startTime: string;
  endTime: string;
  required: number;
  /** Dilimin en yoğun saatinde haftalık ortalama sipariş */
  peakPerHour: number;
  /** Dilimin saat başı ortalaması */
  avgPerHour: number;
  suggested: number;
  verdict: "artir" | "azalt" | "uygun";
}

const hourOf = (hhmm: string) => Number(hhmm.slice(0, 2));

/**
 * Vardiya dilimi başına önerilen kurye: dilimin en yoğun saatindeki sipariş ÷ kurye başına saatlik iş (yukarı yuvarla).
 * Talep olan dilimde en az 1 kurye; hiç talep yoksa 0 (dilimi kapatmayı düşünün).
 */
export function staffingAdvice(
  matrix: number[][],
  templates: ShiftSlotTemplate[],
  ordersPerCourierHour = DEFAULT_ORDERS_PER_COURIER_HOUR,
): StaffingAdvice[] {
  const rate = ordersPerCourierHour > 0 ? ordersPerCourierHour : DEFAULT_ORDERS_PER_COURIER_HOUR;
  return templates
    .filter((t) => t.active)
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
    .map((t) => {
      const hours = matrix[t.weekday - 1]!.slice(hourOf(t.startTime), hourOf(t.endTime));
      const peak = Math.max(0, ...hours);
      const avg = hours.length ? hours.reduce((s, x) => s + x, 0) / hours.length : 0;
      const suggested = peak > 0 ? Math.max(1, Math.ceil(peak / rate - 1e-9)) : 0;
      return {
        templateId: t.id,
        weekday: t.weekday,
        startTime: t.startTime,
        endTime: t.endTime,
        required: t.required,
        peakPerHour: peak,
        avgPerHour: avg,
        suggested,
        verdict: suggested > t.required ? "artir" : suggested < t.required ? "azalt" : "uygun",
      };
    });
}

/** Hiçbir etkin dilimin kapsamadığı ama haftada en az `min` sipariş gelen saatler */
export function uncoveredDemand(matrix: number[][], templates: ShiftSlotTemplate[], min = 0.5): Array<{ weekday: number; hour: number; perWeek: number }> {
  const out: Array<{ weekday: number; hour: number; perWeek: number }> = [];
  for (let w = 1; w <= 7; w++) {
    for (let h = 0; h < 24; h++) {
      const v = matrix[w - 1]![h]!;
      if (v < min) continue;
      const covered = templates.some((t) => t.active && t.weekday === w && hourOf(t.startTime) <= h && h < hourOf(t.endTime));
      if (!covered) out.push({ weekday: w, hour: h, perWeek: v });
    }
  }
  return out;
}

/** Az veride uyarı metni; yeterliyse null */
export function demandDataNote(data: DemandData): string | null {
  const total = data.rows.reduce((s, r) => s + r.orders, 0);
  if (total === 0) return "Bu dönemde sipariş yok.";
  if (total < 30 || data.weeks < 2) return `Az veri (${total} sipariş, ${data.weeks.toLocaleString("tr-TR")} hafta): öneriler kaba tahmindir.`;
  return null;
}
