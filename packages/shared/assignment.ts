/**
 * Otomatik kurye atama (saf fonksiyonlar). Edge Function (auto-dispatch), panel
 * önerileri ve demo modu aynı algoritmayı kullanır.
 *
 * Uygunluk: vardiyada ve molada değil, konumu taze, aktif iş sayısı sınırın altında, alışa
 * mesafesi sınır içinde ve bu işi daha önce bırakmamış kurye.
 * Puan (düşük = iyi): tahmini yol km'si + aktif iş başına ceza km'si − performans avantajı (en fazla ±3 km).
 */
import { haversineMeters, type LatLng } from "./geo.ts";
import { performanceBonusKm } from "./performance.ts";

export interface CandidateCourier {
  id: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  locationAt: string | null;
  activeOrders: number;
  /** Moladaki kurye otomatik iş almaz */
  onBreak?: boolean;
  /** Performans puanı (0–100, yoksa null): yüksek puan birkaç km avantaj */
  performance?: number | null;
}

export interface AssignableOrder {
  id: string;
  pickupLat: number;
  pickupLng: number;
  urgent: boolean;
  /** Yoksa urgent'tan türetilir; ekonomi işler en sona kalır */
  serviceLevel?: "ekonomi" | "standart" | "acil";
  createdAt: string;
  scheduledPickupAt: string | null;
  /** Bu işi bırakmış (geri vermiş) kuryeler */
  declinedBy: string[];
}

export interface AssignmentConfig {
  maxActiveOrdersPerCourier: number;
  maxPickupDistanceKm: number;
  locationMaxAgeMinutes: number;
  now: Date;
}

/** Kuş uçuşu → yaklaşık İstanbul sürüş mesafesi katsayısı */
export const ROAD_FACTOR = 1.35;
/** Her aktif iş, puana bu kadar km ekler (yük dengeleme) */
export const LOAD_PENALTY_KM = 3;
/** Planlı sipariş, alış zamanından bu kadar dakika önce atanabilir */
export const SCHEDULE_LEAD_MINUTES = 30;

export type Ineligibility = "on_break" | "no_location" | "stale_location" | "at_capacity" | "too_far" | "declined";

export interface RankedCourier {
  courier: CandidateCourier;
  distanceKm: number | null;
  score: number;
  eligible: boolean;
  reason: Ineligibility | null;
}

export const INELIGIBILITY_LABELS: Record<Ineligibility, string> = {
  on_break: "molada",
  no_location: "konum yok",
  stale_location: "konum eski",
  at_capacity: "iş kapasitesi dolu",
  too_far: "çok uzak",
  declined: "bu işi bıraktı",
};

export function roadKm(a: LatLng, b: LatLng): number {
  return Math.round((haversineMeters(a, b) * ROAD_FACTOR) / 100) / 10;
}

/** Tüm kuryeleri bu sipariş için sıralar (uygunlar önce, puana göre). */
export function rankCouriers(order: AssignableOrder, couriers: CandidateCourier[], cfg: AssignmentConfig): RankedCourier[] {
  const ranked = couriers.map((c): RankedCourier => {
    const distanceKm =
      c.lat != null && c.lng != null ? roadKm({ lat: c.lat, lng: c.lng }, { lat: order.pickupLat, lng: order.pickupLng }) : null;
    let reason: Ineligibility | null = null;
    if (c.onBreak) reason = "on_break";
    else if (order.declinedBy.includes(c.id)) reason = "declined";
    else if (distanceKm == null || !c.locationAt) reason = "no_location";
    else if (cfg.now.getTime() - new Date(c.locationAt).getTime() > cfg.locationMaxAgeMinutes * 60_000) reason = "stale_location";
    else if (c.activeOrders >= cfg.maxActiveOrdersPerCourier) reason = "at_capacity";
    else if (distanceKm > cfg.maxPickupDistanceKm) reason = "too_far";
    const score = (distanceKm ?? 999) + c.activeOrders * LOAD_PENALTY_KM - performanceBonusKm(c.performance);
    return { courier: c, distanceKm, score: Math.round(score * 10) / 10, eligible: reason === null, reason };
  });
  return ranked.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.score - b.score);
}

/** Şimdi atanmalı mı? Planlı siparişler alış zamanına yaklaşınca. */
export function isDue(order: AssignableOrder, now: Date): boolean {
  if (!order.scheduledPickupAt) return true;
  return new Date(order.scheduledPickupAt).getTime() - now.getTime() <= SCHEDULE_LEAD_MINUTES * 60_000;
}

export interface PlannedAssignment {
  orderId: string;
  courierId: string;
  distanceKm: number;
}

const priority = (o: AssignableOrder) => {
  const level = o.serviceLevel ?? (o.urgent ? "acil" : "standart");
  return level === "acil" ? 2 : level === "standart" ? 1 : 0;
};

/**
 * Bekleyen siparişleri kuryelere dağıtır (açgözlü): acil → standart → ekonomi, aynı seviyede en eski önce.
 * Her atamadan sonra kuryenin yükü artırılır.
 */
export function planAssignments(
  orders: AssignableOrder[],
  couriers: CandidateCourier[],
  cfg: AssignmentConfig,
): { assignments: PlannedAssignment[]; unassigned: string[] } {
  const load = new Map(couriers.map((c) => [c.id, c.activeOrders]));
  const queue = orders
    .filter((o) => isDue(o, cfg.now))
    .sort((a, b) => priority(b) - priority(a) || a.createdAt.localeCompare(b.createdAt));
  const assignments: PlannedAssignment[] = [];
  const unassigned: string[] = [];
  for (const o of queue) {
    const current = couriers.map((c) => ({ ...c, activeOrders: load.get(c.id) ?? c.activeOrders }));
    const best = rankCouriers(o, current, cfg)[0];
    if (!best?.eligible || best.distanceKm == null) {
      unassigned.push(o.id);
      continue;
    }
    assignments.push({ orderId: o.id, courierId: best.courier.id, distanceKm: best.distanceKm });
    load.set(best.courier.id, (load.get(best.courier.id) ?? 0) + 1);
  }
  return { assignments, unassigned };
}
