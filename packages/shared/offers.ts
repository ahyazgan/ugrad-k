/**
 * İş teklifi (otomatik atama): iş kuryeye süreli teklif olarak gider; kurye kabul eder ya da reddeder.
 * Veritabanı: orders.offer_expires_at / offer_accepted_at, courier_offers (sonuçlar), respond_offer / expire_offers.
 */
import type { OrderStatus } from "./orders.ts";

export type OfferResponse = "kabul" | "ret" | "zaman_asimi" | "geri_alindi";

export const OFFER_RESPONSE_LABELS: Record<OfferResponse, string> = {
  kabul: "Kabul etti",
  ret: "Reddetti",
  zaman_asimi: "Süre doldu",
  geri_alindi: "Geri alındı",
};

/** Kurye uygulamasındaki hazır ret nedenleri */
export const OFFER_DECLINE_REASONS = ["Çok uzak", "Elimde başka iş var", "Paket aracıma uygun değil", "Mola vereceğim", "Diğer"] as const;

/** Süresi dolan teklifin kuryesine aynı iş bu kadar dakika tekrar önerilmez (açık ret kalıcıdır) */
export const TIMEOUT_EXCLUSION_MINUTES = 10;

export interface OfferState {
  status: OrderStatus;
  offerExpiresAt: string | null | undefined;
  offerAcceptedAt: string | null | undefined;
}

/** Kurye henüz yanıt vermemiş teklif mi? */
export function isOfferPending(o: OfferState): boolean {
  return o.status === "kuryeye_atandi" && !!o.offerExpiresAt && !o.offerAcceptedAt;
}

/** Kalan saniye (0'ın altına inmez) */
export function offerSecondsLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 1000));
}

export interface OfferRecord {
  orderId: string;
  courierId: string;
  response: OfferResponse | null;
  respondedAt: string | null;
}

/** Siparişi otomatik atamada almaması gereken kuryeler: reddedenler ve son 10 dk'da süresi dolanlar */
export function excludedCouriers(offers: OfferRecord[], now: Date = new Date()): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const cutoff = now.getTime() - TIMEOUT_EXCLUSION_MINUTES * 60_000;
  for (const o of offers) {
    const excluded =
      o.response === "ret" || (o.response === "zaman_asimi" && !!o.respondedAt && new Date(o.respondedAt).getTime() >= cutoff);
    if (excluded) out.set(o.orderId, [...new Set([...(out.get(o.orderId) ?? []), o.courierId])]);
  }
  return out;
}

export interface AcceptanceStats {
  offered: number;
  accepted: number;
  declined: number;
  timedOut: number;
  /** Kabul oranı 0–1; hiç teklif yoksa null */
  rate: number | null;
}

/** Kabul oranı: geri alınan ve bekleyen teklifler sayılmaz */
export function acceptanceStats(responses: Array<OfferResponse | null>): AcceptanceStats {
  const accepted = responses.filter((r) => r === "kabul").length;
  const declined = responses.filter((r) => r === "ret").length;
  const timedOut = responses.filter((r) => r === "zaman_asimi").length;
  const offered = accepted + declined + timedOut;
  return { offered, accepted, declined, timedOut, rate: offered ? accepted / offered : null };
}
