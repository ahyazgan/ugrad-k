/**
 * Kurye belge ve uyum takibi. Liste veritabanındaki `courier_document_types` ile aynıdır (schema-sync testi).
 * Zorunlu belgesi eksik veya süresi dolmuş kurye, ops_settings.enforce_courier_documents açıkken vardiyaya
 * giremez ve otomatik atamada iş almaz. Kaynak: docs/fiyat-arastirmasi.md §5.2, §8.6.
 */

export type CourierDocumentKind =
  | "ehliyet"
  | "kurye_faaliyet_belgesi"
  | "ruhsat"
  | "trafik_sigortasi"
  | "src"
  | "muayene"
  | "kasko"
  | "adli_sicil"
  | "vergi_levhasi";

export interface CourierDocumentType {
  kind: CourierDocumentKind;
  label: string;
  required: boolean;
  /** Bitiş tarihi olan belge */
  expires: boolean;
}

export const COURIER_DOCUMENT_TYPES: CourierDocumentType[] = [
  { kind: "ehliyet", label: "Sürücü belgesi (A1/A2/A)", required: true, expires: true },
  { kind: "kurye_faaliyet_belgesi", label: "Kurye faaliyet belgesi", required: true, expires: true },
  { kind: "ruhsat", label: "Motosiklet ruhsatı", required: true, expires: false },
  { kind: "trafik_sigortasi", label: "Zorunlu trafik sigortası", required: true, expires: true },
  { kind: "src", label: "SRC / mesleki yeterlilik (kurye)", required: false, expires: true },
  { kind: "muayene", label: "Araç muayenesi", required: false, expires: true },
  { kind: "kasko", label: "Kasko / ferdi kaza sigortası", required: false, expires: true },
  { kind: "adli_sicil", label: "Adli sicil kaydı", required: false, expires: false },
  { kind: "vergi_levhasi", label: "Vergi levhası / esnaf muafiyet belgesi", required: false, expires: false },
];

export const DOCUMENT_LABELS = Object.fromEntries(COURIER_DOCUMENT_TYPES.map((t) => [t.kind, t.label])) as Record<CourierDocumentKind, string>;

export interface CourierDocument {
  kind: CourierDocumentKind;
  number?: string | null;
  /** YYYY-MM-DD */
  expiresAt: string | null;
}

export type DocumentState = "gecerli" | "yaklasiyor" | "suresi_doldu" | "eksik";

export interface ComplianceItem {
  kind: CourierDocumentKind;
  label: string;
  required: boolean;
  state: DocumentState;
  expiresAt: string | null;
  /** Bitişe kalan gün (bitiş yoksa null; geçmişse eksi) */
  daysLeft: number | null;
}

export interface Compliance {
  /** Zorunlu belgelerin hepsi var ve süresi dolmamış */
  ok: boolean;
  items: ComplianceItem[];
  /** Vardiyayı / işi engelleyenler (zorunlu, eksik veya süresi dolmuş) */
  blocking: ComplianceItem[];
  /** Süresi yaklaşan veya dolmuş tüm belgeler (zorunlu olmayanlar dahil) */
  warnings: ComplianceItem[];
}

export const EXPIRY_WARN_DAYS = 30;

const DAY_MS = 86_400_000;
/** İstanbul takvim günü (YYYY-MM-DD) */
export const istanbulDay = (d: Date = new Date()) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** Belge, bitiş tarihinin sonuna kadar (o gün dahil) geçerlidir */
export function courierCompliance(docs: CourierDocument[], now: Date = new Date(), warnDays = EXPIRY_WARN_DAYS): Compliance {
  const today = istanbulDay(now);
  const items = COURIER_DOCUMENT_TYPES.map((t): ComplianceItem => {
    const d = docs.find((x) => x.kind === t.kind);
    const base = { kind: t.kind, label: t.label, required: t.required };
    if (!d) return { ...base, state: "eksik", expiresAt: null, daysLeft: null };
    if (!t.expires || !d.expiresAt) return { ...base, state: "gecerli", expiresAt: d.expiresAt ?? null, daysLeft: null };
    const daysLeft = dayDiff(today, d.expiresAt);
    const state: DocumentState = daysLeft < 0 ? "suresi_doldu" : daysLeft <= warnDays ? "yaklasiyor" : "gecerli";
    return { ...base, state, expiresAt: d.expiresAt, daysLeft };
  });
  const blocking = items.filter((i) => i.required && (i.state === "eksik" || i.state === "suresi_doldu"));
  const warnings = items.filter((i) => i.state === "yaklasiyor" || i.state === "suresi_doldu");
  return { ok: blocking.length === 0, items, blocking, warnings };
}

/** Kullanıcıya gösterilecek kısa açıklama: "Sürücü belgesi (süresi dolmuş), Kurye faaliyet belgesi (eksik)" */
export function blockingSummary(c: Compliance): string {
  return c.blocking.map((i) => `${i.label} (${i.state === "eksik" ? "eksik" : "süresi dolmuş"})`).join(", ");
}
