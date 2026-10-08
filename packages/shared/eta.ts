/**
 * Tahmini teslim zamanı (ETA) ve acil teslim taahhüdü (60 dk).
 * Taahhüt süresi: siparişten (planlıysa alış zamanından, kartla ödemede ödemeden) itibaren
 * ops_settings.urgent_sla_minutes; veritabanında orders.sla_due_at tetikleyiciyle yazılır.
 * Taahhüt kaçarsa acil ek ücreti müşterinin sonraki siparişinden düşülür (customer_credits).
 */
import { roadKm } from "./assignment.ts";
import type { OrderStatus } from "./orders.ts";

/** İstanbul'da motosikletin ortalama hızı (TomTom zirve saat otomobil 20,7 km/s; motosiklet biraz hızlı) */
export const COURIER_SPEED_KMH = 25;
/** Alışta paketi teslim alma süresi */
export const HANDOVER_MINUTES = 5;
/** Kurye atanmamışsa atama + alışa gidiş için varsayılan */
export const UNASSIGNED_BUFFER_MINUTES = 20;
/** ETA taahhüdü bu kadar dakika aşarsa "risk" sayılır (erken uyarı payı) */
export const SLA_RISK_MARGIN_MINUTES = 0;

export interface LatLngLike {
  lat: number;
  lng: number;
}

export interface EtaOrder {
  status: OrderStatus;
  pickup: LatLngLike;
  dropoff: LatLngLike;
  /** Rota servisinden alış→teslim süresi (saniye); yoksa kuş uçuşundan */
  durationSeconds?: number | null;
}

const legMinutes = (a: LatLngLike, b: LatLngLike) => (roadKm(a, b) / COURIER_SPEED_KMH) * 60;

/** Şu andan teslime kalan tahmini dakika; teslim edilmiş/iptal/sorunlu için null */
export function etaMinutes(o: EtaOrder, courier: LatLngLike | null): number | null {
  const delivery = o.durationSeconds ? o.durationSeconds / 60 : legMinutes(o.pickup, o.dropoff);
  switch (o.status) {
    case "beklemede":
    case "onaylandi":
      return UNASSIGNED_BUFFER_MINUTES + HANDOVER_MINUTES + delivery;
    case "kuryeye_atandi":
      return (courier ? legMinutes(courier, o.pickup) : UNASSIGNED_BUFFER_MINUTES / 2) + HANDOVER_MINUTES + delivery;
    case "alindi":
      return courier ? legMinutes(courier, o.dropoff) : delivery;
    case "yolda":
      return courier ? legMinutes(courier, o.dropoff) : delivery / 2;
    default:
      return null;
  }
}

export function etaAt(o: EtaOrder, courier: LatLngLike | null, now: Date = new Date()): Date | null {
  const m = etaMinutes(o, courier);
  return m == null ? null : new Date(now.getTime() + Math.ceil(m) * 60_000);
}

export type SlaState = "zamaninda" | "riskli" | "gecikti" | "karsilandi" | "kacirildi";

export const SLA_LABELS: Record<SlaState, string> = {
  zamaninda: "Zamanında",
  riskli: "Gecikme riski",
  gecikti: "Gecikti",
  karsilandi: "Taahhüt karşılandı",
  kacirildi: "Taahhüt kaçırıldı",
};

/** Acil siparişin taahhüt durumu (sla_due_at yoksa null) */
export function slaState(
  o: { slaDueAt: string | null; deliveredAt: string | null; status: OrderStatus },
  eta: Date | null,
  now: Date = new Date(),
): SlaState | null {
  if (!o.slaDueAt || o.status === "iptal") return null;
  const due = new Date(o.slaDueAt).getTime();
  if (o.deliveredAt) return new Date(o.deliveredAt).getTime() <= due ? "karsilandi" : "kacirildi";
  if (now.getTime() > due) return "gecikti";
  if (eta && eta.getTime() > due + SLA_RISK_MARGIN_MINUTES * 60_000) return "riskli";
  return "zamaninda";
}

/** "14:35" (İstanbul) */
export const istanbulTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
