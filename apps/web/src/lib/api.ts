"use client";

import {
  buildQuote,
  DEFAULT_PRICING_SETTINGS,
  mockMapsProvider,
  parseOrderRequest,
  ValidationError,
  type PlaceDetails,
  type PlaceSuggestion,
  type PriceQuote,
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
  urgent: boolean;
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
