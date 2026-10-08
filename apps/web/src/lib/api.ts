"use client";

import {
  buildQuote,
  DEFAULT_PRICING_SETTINGS,
  mockMapsProvider,
  parseOrderRequest,
  PricingError,
  ValidationError,
  type PlaceDetails,
  type PlaceSuggestion,
  type PriceQuote,
  type ServiceLevel,
} from "@yazgan/shared";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
/** Supabase bağlı değilse site örnek adreslerle ve varsayılan tarifeyle çalışır */
export const demoMode = !url || !anonKey;

export class SiteApiError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
  }
}

export interface SiteQuote {
  quote: PriceQuote;
  distanceMeters: number;
  durationSeconds: number;
  bridgeCrossings: number;
}

export interface OrderDraft {
  pickup: PlaceDetails;
  dropoff: PlaceDetails;
  serviceLevel: ServiceLevel;
  roundTrip: boolean;
  largePackage: boolean;
}

export interface LeadInput {
  kind: "kurumsal" | "iletisim";
  companyName?: string;
  contactName: string;
  phone: string;
  email?: string;
  district?: string;
  monthlyVolume?: string;
  message?: string;
  sourcePage?: string;
  kvkkConsent: boolean;
  /** Bal küpü (görünmez alan) */
  website?: string;
}

async function call<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/site-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new SiteApiError("Bağlantı kurulamadı, lütfen tekrar deneyin");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
  if (!res.ok) throw new SiteApiError(data.error ?? "Beklenmeyen bir hata oluştu", data.field);
  return data as T;
}

const maps = mockMapsProvider();

export async function searchPlaces(input: string, sessionToken: string): Promise<PlaceSuggestion[]> {
  if (demoMode) return maps.autocomplete(input, sessionToken);
  return (await call<{ suggestions: PlaceSuggestion[] }>("places", { input, sessionToken })).suggestions;
}

export async function placeDetails(placeId: string, sessionToken: string): Promise<PlaceDetails> {
  if (demoMode) return maps.placeDetails(placeId, sessionToken);
  return (await call<{ place: PlaceDetails }>("places", { placeId, sessionToken })).place;
}

export async function quote(d: OrderDraft): Promise<SiteQuote> {
  const order = { ...d, weightKg: null, scheduledPickupAt: null, paymentMethod: "nakit" };
  if (!demoMode) return call<SiteQuote>("quote", { order });
  try {
    const q = await buildQuote(parseOrderRequest(order), { maps, settings: DEFAULT_PRICING_SETTINGS, holidays: [] });
    return { quote: q.quote, distanceMeters: q.distanceMeters, durationSeconds: q.durationSeconds, bridgeCrossings: q.bridgeCrossings };
  } catch (e) {
    if (e instanceof ValidationError) throw new SiteApiError(e.message, e.field);
    if (e instanceof PricingError) throw new SiteApiError(e.message);
    throw e;
  }
}

export async function submitLead(lead: LeadInput): Promise<void> {
  if (demoMode) {
    if (!lead.kvkkConsent) throw new SiteApiError("Aydınlatma metnini onaylamanız gerekiyor", "kvkkConsent");
    await new Promise((r) => setTimeout(r, 300));
    return;
  }
  await call("lead", { lead });
}

export const APPLICATION_DOCS = {
  ehliyet_on: "Ehliyet (ön yüz)",
  ehliyet_arka: "Ehliyet (arka yüz)",
  ruhsat: "Motosiklet ruhsatı",
  vesikalik: "Vesikalık fotoğraf",
} as const;
export type DocKind = keyof typeof APPLICATION_DOCS;
export const MAX_DOC_BYTES = 5 * 1024 * 1024;

export interface CourierApplicationInput {
  fullName: string;
  phone: string;
  email?: string;
  district?: string;
  birthYear?: string;
  licenseClass?: string;
  hasMotorcycle: boolean;
  plate?: string;
  vehicleModel?: string;
  experienceYears?: string;
  availability?: string;
  message?: string;
  kvkkConsent: boolean;
  website?: string;
}

const extOf = (f: File) => (f.name.split(".").pop() ?? "").toLowerCase();

/** Başvuruyu gönderir, ardından belgeleri imzalı adreslere doğrudan yükler. */
export async function applyCourier(app: CourierApplicationInput, files: Partial<Record<DocKind, File>>): Promise<void> {
  const entries = Object.entries(files).filter((e): e is [DocKind, File] => !!e[1]);
  for (const [, f] of entries) {
    if (f.size > MAX_DOC_BYTES) throw new SiteApiError(`${f.name} 5 MB'tan büyük`, "documents");
  }
  if (demoMode) {
    if (!app.kvkkConsent) throw new SiteApiError("Aydınlatma metnini onaylamanız gerekiyor", "kvkkConsent");
    if (!/^0?5\d{9}$/.test(app.phone.replace(/\D/g, "").replace(/^90/, ""))) throw new SiteApiError("Geçerli bir cep telefonu numarası girin", "phone");
    await new Promise((r) => setTimeout(r, 300));
    return;
  }
  const res = await call<{ uploads: Array<{ kind: DocKind; signedUrl: string }> }>("courier-apply", {
    application: { ...app, documents: entries.map(([kind, f]) => ({ kind, ext: extOf(f) })) },
  });
  for (const u of res.uploads) {
    const f = files[u.kind]!;
    const r = await fetch(u.signedUrl, { method: "PUT", headers: { "Content-Type": f.type || "application/octet-stream", "x-upsert": "false" }, body: f });
    if (!r.ok) throw new SiteApiError(`${APPLICATION_DOCS[u.kind]} yüklenemedi; başvurunuz alındı, belgeyi görüşmede getirebilirsiniz.`);
  }
}
