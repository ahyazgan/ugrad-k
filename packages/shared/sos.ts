/**
 * Acil durum (SOS): kurye tek tuşla konumuyla yöneticiye alarm verir.
 * Alarm metni burada üretilir; sos Edge Function'ı ve yeniden uyarı (auto-dispatch) aynı metni kullanır.
 */
export type IncidentKind = "kaza" | "tehlike" | "saglik" | "arac_ariza" | "diger";

export const INCIDENT_KINDS: Record<IncidentKind, string> = {
  kaza: "Kaza",
  tehlike: "Tehlike / saldırı",
  saglik: "Sağlık sorunu",
  arac_ariza: "Araç arızası",
  diger: "Diğer",
};

/** Görülmeyen alarm bu aralıkla yeniden gönderilir */
export const SOS_REALERT_MINUTES = 5;
/** En fazla bu kadar gönderim (ilki dahil) */
export const SOS_MAX_ALERTS = 3;

export function isIncidentKind(v: unknown): v is IncidentKind {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(INCIDENT_KINDS, v);
}

export interface SosAlertInput {
  kind: IncidentKind;
  courierName: string | null;
  courierPhone: string | null;
  lat: number | null;
  lng: number | null;
  accuracyM?: number | null;
  note?: string | null;
  orderNo?: string | null;
  /** Yeniden gönderimde kaçıncı uyarı */
  repeat?: number;
}

/** Yöneticiye giden alarm metni (WhatsApp/SMS) */
export function sosAlertText(i: SosAlertInput): string {
  const who = [i.courierName ?? "Kurye", i.courierPhone].filter(Boolean).join(" ");
  const where =
    i.lat != null && i.lng != null
      ? `Konum: https://maps.google.com/?q=${i.lat.toFixed(5)},${i.lng.toFixed(5)}${i.accuracyM ? ` (±${Math.round(i.accuracyM)} m)` : ""}`
      : "Konum alınamadı";
  return [
    `🚨 ACİL DURUM${i.repeat && i.repeat > 1 ? ` (${i.repeat}. uyarı, henüz görülmedi)` : ""}: ${who} — ${INCIDENT_KINDS[i.kind]}.`,
    i.note ? `Not: ${i.note}.` : null,
    where + ".",
    i.orderNo ? `Elindeki iş: ${i.orderNo}.` : null,
    "Panelde 'Gördüm' deyin.",
  ]
    .filter(Boolean)
    .join(" ");
}
