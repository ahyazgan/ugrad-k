/**
 * Durak sırası: kurye aynı anda birden fazla iş taşırken hangi adrese önce gideceği.
 * Kurallar: bir işin alışı teslimden önce gelir; zaten alınmış işte yalnız teslim, iade dönüşünde
 * yalnız göndericiye teslim durağı vardır. Amaç toplam süreyi kısaltırken acil işlerin taahhüdünü
 * kaçırmamak: maliyet = dakika + taahhüt gecikmesi × LATE_PENALTY. 8 durağa kadar tüm sıralamalar
 * denenir (en iyisi), daha fazlasında en yakın uygun durak seçilir.
 */
import { roadKm } from "./assignment.ts";
import { COURIER_SPEED_KMH, HANDOVER_MINUTES, type LatLngLike } from "./eta.ts";
import type { OrderStatus } from "./orders.ts";

/** Taahhüt gecikmesinin her dakikası bu kadar dakika sürüş sayılır */
export const LATE_PENALTY = 10;
/** Bu sayıya kadar durakta tüm sıralamalar denenir */
const EXACT_LIMIT = 8;

export interface RouteJob {
  id: string;
  orderNo: string;
  status: OrderStatus;
  pickup: LatLngLike & { address: string };
  dropoff: LatLngLike & { address: string };
  urgent?: boolean;
  /** Acil teslim taahhüdü (ISO) */
  slaDueAt?: string | null;
}

export type StopKind = "alis" | "teslim" | "iade";

export const STOP_LABELS: Record<StopKind, string> = { alis: "Alış", teslim: "Teslim", iade: "Göndericiye iade" };

export interface Stop {
  jobId: string;
  orderNo: string;
  kind: StopKind;
  lat: number;
  lng: number;
  address: string;
  urgent: boolean;
  /** Şu andan bu durağa varışa tahmini dakika (önceki duraklardaki teslim alma/verme dahil) */
  etaMinutes: number;
  /** Teslim durağında taahhüt bu sırayla kaçacak mı */
  late: boolean;
}

interface Node {
  jobId: string;
  orderNo: string;
  kind: StopKind;
  point: LatLngLike & { address: string };
  urgent: boolean;
  dueMs: number | null;
  /** Önce gelmesi gereken durak (aynı işin alışı) */
  after: number | null;
}

const minutes = (a: LatLngLike, b: LatLngLike) => (roadKm(a, b) / COURIER_SPEED_KMH) * 60;

function nodesOf(jobs: RouteJob[]): Node[] {
  const nodes: Node[] = [];
  for (const j of jobs) {
    const urgent = !!j.urgent;
    const dueMs = j.slaDueAt ? new Date(j.slaDueAt).getTime() : null;
    if (j.status === "kuryeye_atandi") {
      nodes.push({ jobId: j.id, orderNo: j.orderNo, kind: "alis", point: j.pickup, urgent, dueMs: null, after: null });
      nodes.push({ jobId: j.id, orderNo: j.orderNo, kind: "teslim", point: j.dropoff, urgent, dueMs, after: nodes.length - 1 });
    } else if (j.status === "alindi" || j.status === "yolda" || j.status === "sorunlu") {
      nodes.push({ jobId: j.id, orderNo: j.orderNo, kind: "teslim", point: j.dropoff, urgent, dueMs, after: null });
    } else if (j.status === "geri_donuyor") {
      nodes.push({ jobId: j.id, orderNo: j.orderNo, kind: "iade", point: j.pickup, urgent: false, dueMs: null, after: null });
    }
  }
  return nodes;
}

/** Sıralamanın süresi ve maliyeti; her durağa varış dakikası */
function evaluate(order: number[], nodes: Node[], start: LatLngLike | null, nowMs: number) {
  let t = 0;
  let cost = 0;
  let at: LatLngLike | null = start;
  const arrivals: number[] = [];
  for (const i of order) {
    const n = nodes[i]!;
    if (at) t += minutes(at, n.point);
    arrivals.push(t);
    if (n.dueMs != null) {
      const late = Math.max(0, nowMs + t * 60_000 - n.dueMs) / 60_000;
      cost += late * LATE_PENALTY;
    }
    t += HANDOVER_MINUTES;
    at = n.point;
  }
  return { cost: cost + t, arrivals };
}

function feasible(order: number[], nodes: Node[]) {
  const seen = new Set<number>();
  for (const i of order) {
    const after = nodes[i]!.after;
    if (after != null && !seen.has(after)) return false;
    seen.add(i);
  }
  return true;
}

function* permutations(xs: number[]): Generator<number[]> {
  if (xs.length <= 1) {
    yield xs;
    return;
  }
  for (let i = 0; i < xs.length; i++) {
    const rest = [...xs.slice(0, i), ...xs.slice(i + 1)];
    for (const p of permutations(rest)) yield [xs[i]!, ...p];
  }
}

/** En yakın uygun durak (çok durakta) */
function greedy(nodes: Node[], start: LatLngLike | null): number[] {
  const done = new Set<number>();
  const order: number[] = [];
  let at = start;
  while (order.length < nodes.length) {
    let best = -1;
    let bestCost = Infinity;
    nodes.forEach((n, i) => {
      if (done.has(i) || (n.after != null && !done.has(n.after))) return;
      // Acil teslim öne çekilir
      const c = (at ? minutes(at, n.point) : 0) - (n.urgent && n.kind === "teslim" ? 15 : 0);
      if (c < bestCost) {
        bestCost = c;
        best = i;
      }
    });
    done.add(best);
    order.push(best);
    at = nodes[best]!.point;
  }
  return order;
}

/** Kuryenin elindeki işler için önerilen durak sırası */
export function planStops(jobs: RouteJob[], courier: LatLngLike | null, now: Date = new Date()): Stop[] {
  const nodes = nodesOf(jobs);
  if (!nodes.length) return [];
  const nowMs = now.getTime();
  let best: number[] = greedy(nodes, courier);
  if (nodes.length <= EXACT_LIMIT) {
    let bestCost = evaluate(best, nodes, courier, nowMs).cost;
    for (const p of permutations(nodes.map((_, i) => i))) {
      if (!feasible(p, nodes)) continue;
      const c = evaluate(p, nodes, courier, nowMs).cost;
      if (c < bestCost - 1e-9) {
        bestCost = c;
        best = p;
      }
    }
  }
  const { arrivals } = evaluate(best, nodes, courier, nowMs);
  return best.map((i, k) => {
    const n = nodes[i]!;
    return {
      jobId: n.jobId,
      orderNo: n.orderNo,
      kind: n.kind,
      lat: n.point.lat,
      lng: n.point.lng,
      address: n.point.address,
      urgent: n.urgent,
      etaMinutes: Math.round(arrivals[k]!),
      late: n.dueMs != null && nowMs + arrivals[k]! * 60_000 > n.dueMs,
    };
  });
}

/** Tüm durakları sırayla Google Haritalar'da açan bağlantı (son durak varış, öncekiler ara nokta) */
export function stopsDirectionsUrl(stops: Pick<Stop, "lat" | "lng">[]): string | null {
  if (!stops.length) return null;
  const fmt = (s: Pick<Stop, "lat" | "lng">) => `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`;
  const last = stops[stops.length - 1]!;
  const via = stops.slice(0, -1).map(fmt).join("|");
  return `https://www.google.com/maps/dir/?api=1&destination=${fmt(last)}${via ? `&waypoints=${encodeURIComponent(via)}` : ""}&travelmode=driving`;
}
