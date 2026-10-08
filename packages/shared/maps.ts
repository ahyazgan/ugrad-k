/**
 * Harita sağlayıcısı. Google Maps Platform'un güncel API'leri kullanılır:
 *   • Places API (New): autocomplete + place details
 *   • Routes API: computeRoutes (eski Distance Matrix'in yerini aldı; Mart 2025'ten
 *     sonra açılan projelerde eski Distance Matrix/Places API etkinleştirilemiyor)
 * API anahtarı yalnızca sunucuda (Edge Function) kullanılır, uygulamaya gömülmez.
 */
import { haversineMeters, resolveSide, type IstanbulSide, type LatLng } from "./geo.ts";

export interface PlaceSuggestion {
  placeId: string;
  title: string;
  subtitle: string;
}

export interface PlaceDetails {
  placeId: string;
  address: string;
  lat: number;
  lng: number;
  district: string | null;
  side: IstanbulSide;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
}

export interface MapsProvider {
  readonly name: "google" | "mock";
  autocomplete(input: string, sessionToken?: string): Promise<PlaceSuggestion[]>;
  placeDetails(placeId: string, sessionToken?: string): Promise<PlaceDetails>;
  route(origin: LatLng, destination: LatLng): Promise<RouteResult>;
}

export class MapsError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

type FetchFn = typeof fetch;

// Beykoz merkezli, İstanbul'u kapsayan arama önceliği
const ISTANBUL_BIAS = { circle: { center: { latitude: 41.05, longitude: 29.05 }, radius: 50_000 } };

export function googleMapsProvider(apiKey: string, fetchFn: FetchFn = fetch): MapsProvider {
  if (!apiKey) throw new MapsError("GOOGLE_MAPS_API_KEY tanımlı değil");

  async function call<T>(url: string, init: RequestInit, fieldMask: string): Promise<T> {
    const res = await fetchFn(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new MapsError(`Google Maps hatası (${res.status}): ${body.slice(0, 300)}`, res.status);
    }
    return (await res.json()) as T;
  }

  return {
    name: "google",

    async autocomplete(input, sessionToken) {
      type Resp = {
        suggestions?: Array<{
          placePrediction?: {
            placeId: string;
            text?: { text: string };
            structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
          };
        }>;
      };
      const data = await call<Resp>(
        "https://places.googleapis.com/v1/places:autocomplete",
        {
          method: "POST",
          body: JSON.stringify({
            input,
            languageCode: "tr",
            regionCode: "tr",
            includedRegionCodes: ["tr"],
            locationBias: ISTANBUL_BIAS,
            ...(sessionToken ? { sessionToken } : {}),
          }),
        },
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
      );
      return (data.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => ({
          placeId: p.placeId,
          title: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
          subtitle: p.structuredFormat?.secondaryText?.text ?? "",
        }));
    },

    async placeDetails(placeId, sessionToken) {
      type Resp = {
        id: string;
        formattedAddress?: string;
        location?: { latitude: number; longitude: number };
        addressComponents?: Array<{ longText: string; types: string[] }>;
      };
      const qs = new URLSearchParams({ languageCode: "tr", regionCode: "tr" });
      if (sessionToken) qs.set("sessionToken", sessionToken);
      const data = await call<Resp>(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${qs}`,
        { method: "GET" },
        "id,formattedAddress,location,addressComponents",
      );
      if (!data.location) throw new MapsError("Adresin konumu bulunamadı");
      const district =
        data.addressComponents?.find((c) => c.types.includes("administrative_area_level_2"))?.longText ?? null;
      const point = { lat: data.location.latitude, lng: data.location.longitude };
      return {
        placeId: data.id,
        address: data.formattedAddress ?? "",
        ...point,
        district,
        side: resolveSide(point, district),
      };
    },

    async route(origin, destination) {
      type Resp = { routes?: Array<{ distanceMeters?: number; duration?: string }> };
      const toWaypoint = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
      const data = await call<Resp>(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
          method: "POST",
          body: JSON.stringify({
            origin: toWaypoint(origin),
            destination: toWaypoint(destination),
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_UNAWARE",
            languageCode: "tr-TR",
            units: "METRIC",
          }),
        },
        "routes.distanceMeters,routes.duration",
      );
      const r = data.routes?.[0];
      if (!r || r.distanceMeters == null) throw new MapsError("Rota bulunamadı");
      return { distanceMeters: r.distanceMeters, durationSeconds: parseInt(r.duration ?? "0", 10) || 0 };
    },
  };
}

/** Geliştirme ve test için: API anahtarı olmadan çalışan sahte sağlayıcı. */
export const MOCK_PLACES: ReadonlyArray<PlaceDetails> = [
  { placeId: "mock-beykoz", address: "Kılıçlı Mah. Şile Cad. No: 8A, Beykoz/İstanbul", lat: 41.1295, lng: 29.1135, district: "Beykoz", side: "anadolu" },
  { placeId: "mock-kadikoy", address: "Caferağa Mah., Moda Cad., Kadıköy/İstanbul", lat: 40.9877, lng: 29.0275, district: "Kadıköy", side: "anadolu" },
  { placeId: "mock-uskudar", address: "Mimar Sinan Mah., Üsküdar Meydanı, Üsküdar/İstanbul", lat: 41.0262, lng: 29.0156, district: "Üsküdar", side: "anadolu" },
  { placeId: "mock-atasehir", address: "Barbaros Mah., Ataşehir/İstanbul", lat: 40.9923, lng: 29.1244, district: "Ataşehir", side: "anadolu" },
  { placeId: "mock-umraniye", address: "Atatürk Mah., Ümraniye/İstanbul", lat: 41.0256, lng: 29.0963, district: "Ümraniye", side: "anadolu" },
  { placeId: "mock-kartal", address: "Kartal Meydanı, Kartal/İstanbul", lat: 40.889, lng: 29.1856, district: "Kartal", side: "anadolu" },
  { placeId: "mock-levent", address: "Levent Mah., Büyükdere Cad., Beşiktaş/İstanbul", lat: 41.0819, lng: 29.0106, district: "Beşiktaş", side: "avrupa" },
  { placeId: "mock-sisli", address: "Mecidiyeköy Mah., Şişli/İstanbul", lat: 41.0677, lng: 28.9946, district: "Şişli", side: "avrupa" },
  { placeId: "mock-taksim", address: "Taksim Meydanı, Beyoğlu/İstanbul", lat: 41.0369, lng: 28.985, district: "Beyoğlu", side: "avrupa" },
  { placeId: "mock-bakirkoy", address: "Ataköy, Bakırköy/İstanbul", lat: 40.9819, lng: 28.8772, district: "Bakırköy", side: "avrupa" },
];

export function mockMapsProvider(places: ReadonlyArray<PlaceDetails> = MOCK_PLACES): MapsProvider {
  const fold = (s: string) => s.toLocaleLowerCase("tr-TR");
  return {
    name: "mock",
    async autocomplete(input) {
      const q = fold(input.trim());
      return places
        .filter((p) => !q || fold(p.address).includes(q) || fold(p.district ?? "").includes(q))
        .slice(0, 5)
        .map((p) => ({ placeId: p.placeId, title: p.address.split(",")[0]!, subtitle: p.address }));
    },
    async placeDetails(placeId) {
      const p = places.find((x) => x.placeId === placeId);
      if (!p) throw new MapsError("Adres bulunamadı", 404);
      return p;
    },
    async route(origin, destination) {
      // Kuş uçuşu × 1,35 ≈ İstanbul'da sürüş mesafesi; ortalama 25 km/sa
      const distanceMeters = Math.round(haversineMeters(origin, destination) * 1.35);
      return { distanceMeters, durationSeconds: Math.round(distanceMeters / (25_000 / 3600)) };
    },
  };
}
