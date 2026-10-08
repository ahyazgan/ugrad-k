import type { AdminOrder, OrderRating } from "./repo";
import { istDate } from "./dates";

/** Acil teslimat hedefi (dakika) */
export const URGENT_TARGET_MIN = 60;
const IST_OFFSET_MS = 3 * 3600_000;

export interface Report {
  totals: {
    orders: number;
    delivered: number;
    cancelled: number;
    cancelRate: number; // 0..1
    revenueKurus: number; // teslim edilenlerin KDV hariç toplamı
    avgOrderKurus: number;
    avgDeliveryMin: number | null;
    urgentDelivered: number;
    urgentOnTimeRate: number | null; // 0..1
    crossSideRate: number; // Avrupa yakasına dokunan sipariş oranı
    avgRating: number | null; // 1..5, bir ondalık
    ratingCount: number;
    /** Değerlendirme oranı: puan verilen / teslim edilen */
    ratingRate: number | null;
  };
  /** Puan dağılımı: index 0 → 1 yıldız … 4 → 5 yıldız */
  ratingDist: number[];
  /** 3 ve altı puanlar (en yeni önce) */
  lowRatings: OrderRating[];
  daily: Array<{ date: string; orders: number; delivered: number; revenueKurus: number }>;
  hourly: Array<{ hour: number; orders: number }>;
  couriers: Array<{ courierId: string | null; name: string; delivered: number; revenueKurus: number; avgDeliveryMin: number | null; avgRating: number | null }>;
  customerCount: number;
  customers: Array<{ customerId: string; name: string; phone: string | null; delivered: number; revenueKurus: number }>;
}

/** Teslim süresi: oluşturma (planlıysa planlanan alış) → teslim, dakika */
export function deliveryMinutes(o: AdminOrder): number | null {
  if (!o.deliveredAt) return null;
  const start = Math.max(new Date(o.createdAt).getTime(), o.scheduledPickupAt ? new Date(o.scheduledPickupAt).getTime() : 0);
  return Math.max(0, Math.round((new Date(o.deliveredAt).getTime() - start) / 60_000));
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Tarih aralığındaki tüm günler (boş günler de grafikte görünsün) */
function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); istDate(new Date(d.getTime() - IST_OFFSET_MS)) <= to && out.length < 400; d = new Date(d.getTime() + 86_400_000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const avg1 = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function buildReport(orders: AdminOrder[], from: string, to: string, ratings: OrderRating[] = []): Report {
  const delivered = orders.filter((o) => o.status === "teslim_edildi");
  const cancelled = orders.filter((o) => o.status === "iptal");
  const revenueKurus = delivered.reduce((s, o) => s + o.subtotalKurus, 0);
  const times = delivered.map(deliveryMinutes).filter((x): x is number => x != null);
  const urgent = delivered.filter((o) => o.urgent);
  const urgentOnTime = urgent.filter((o) => (deliveryMinutes(o) ?? Infinity) <= URGENT_TARGET_MIN);

  const daily = new Map(daysBetween(from, to).map((d) => [d, { date: d, orders: 0, delivered: 0, revenueKurus: 0 }]));
  for (const o of orders) {
    const d = daily.get(istDate(o.createdAt));
    if (d) d.orders++;
  }
  for (const o of delivered) {
    const d = daily.get(istDate(o.deliveredAt!));
    if (d) {
      d.delivered++;
      d.revenueKurus += o.subtotalKurus;
    }
  }

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  for (const o of orders) hourly[new Date(new Date(o.createdAt).getTime() + IST_OFFSET_MS).getUTCHours()]!.orders++;

  const byCourier = new Map<string, { courierId: string | null; name: string; delivered: number; revenueKurus: number; times: number[] }>();
  for (const o of delivered) {
    const key = o.courierId ?? "—";
    const c = byCourier.get(key) ?? { courierId: o.courierId, name: o.courierName ?? "Atanmamış", delivered: 0, revenueKurus: 0, times: [] };
    c.delivered++;
    c.revenueKurus += o.subtotalKurus;
    const m = deliveryMinutes(o);
    if (m != null) c.times.push(m);
    byCourier.set(key, c);
  }

  const byCustomer = new Map<string, { customerId: string; name: string; phone: string | null; delivered: number; revenueKurus: number }>();
  for (const o of delivered) {
    const c = byCustomer.get(o.customerId) ?? { customerId: o.customerId, name: o.customerName ?? "İsimsiz", phone: o.customerPhone, delivered: 0, revenueKurus: 0 };
    c.delivered++;
    c.revenueKurus += o.subtotalKurus;
    byCustomer.set(o.customerId, c);
  }

  const active = orders.filter((o) => o.status !== "iptal");
  return {
    totals: {
      orders: orders.length,
      delivered: delivered.length,
      cancelled: cancelled.length,
      cancelRate: orders.length ? cancelled.length / orders.length : 0,
      revenueKurus,
      avgOrderKurus: delivered.length ? Math.round(revenueKurus / delivered.length) : 0,
      avgDeliveryMin: avg(times),
      urgentDelivered: urgent.length,
      urgentOnTimeRate: urgent.length ? urgentOnTime.length / urgent.length : null,
      crossSideRate: active.length ? active.filter((o) => o.pickupSide === "avrupa" || o.dropoffSide === "avrupa").length / active.length : 0,
      avgRating: avg1(ratings.map((r) => r.score)),
      ratingCount: ratings.length,
      ratingRate: delivered.length ? Math.min(1, ratings.length / delivered.length) : null,
    },
    ratingDist: [1, 2, 3, 4, 5].map((n) => ratings.filter((r) => r.score === n).length),
    lowRatings: ratings.filter((r) => r.score <= 3).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    daily: [...daily.values()],
    hourly,
    couriers: [...byCourier.values()]
      .map(({ times: t, ...c }) => ({
        ...c,
        avgDeliveryMin: avg(t),
        avgRating: avg1(ratings.filter((r) => r.courierId === c.courierId).map((r) => r.score)),
      }))
      .sort((a, b) => b.delivered - a.delivered),
    customerCount: byCustomer.size,
    customers: [...byCustomer.values()].sort((a, b) => b.revenueKurus - a.revenueKurus).slice(0, 10),
  };
}

const STATUS_TR: Record<AdminOrder["status"], string> = {
  beklemede: "Beklemede",
  onaylandi: "Onaylandı",
  kuryeye_atandi: "Kuryeye atandı",
  alindi: "Alındı",
  yolda: "Yolda",
  teslim_edildi: "Teslim edildi",
  iptal: "İptal",
  sorunlu: "Sorunlu",
};

/** Türkçe Excel uyumlu CSV: ";" ayraç, ondalık virgül, UTF-8 BOM */
export function ordersCsv(orders: AdminOrder[]): string {
  const money = (k: number) => (k / 100).toFixed(2).replace(".", ",");
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const local = (iso: string | null) =>
    iso ? new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ") : "";
  const head = [
    "Sipariş no", "Oluşturma", "Teslim", "Durum", "Müşteri", "Telefon", "Alış", "Teslim adresi",
    "Km", "Acil", "Kurye", "Ödeme", "KDV hariç (TL)", "KDV dahil (TL)", "Teslim süresi (dk)",
  ];
  const rows = orders.map((o) => [
    o.orderNo,
    local(o.createdAt),
    local(o.deliveredAt),
    STATUS_TR[o.status],
    o.customerName,
    o.customerPhone,
    o.pickupAddress,
    o.dropoffAddress,
    o.distanceMeters != null ? (o.distanceMeters / 1000).toFixed(1).replace(".", ",") : "",
    o.urgent ? "Evet" : "Hayır",
    o.courierName,
    o.paymentMethod,
    money(o.subtotalKurus),
    money(o.totalKurus),
    deliveryMinutes(o),
  ]);
  return "﻿" + [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
