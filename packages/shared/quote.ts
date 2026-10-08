/**
 * Sipariş isteği → fiyat teklifi. Mobil uygulama, panel, Edge Functions ve
 * yapay zeka asistanı aynı akışı kullanır: istek doğrulanır, rota mesafesi
 * harita sağlayıcısından alınır, fiyat pricing.ts ile hesaplanır.
 */
import { countBridgeCrossings, resolveSide, type IstanbulSide } from "./geo.ts";
import type { MapsProvider } from "./maps.ts";
import { calculatePrice, SERVICE_LEVELS, type Holiday, type PriceQuote, type PricingSettings, type ServiceLevel } from "./pricing.ts";

export interface OrderPoint {
  address: string;
  details?: string;
  lat: number;
  lng: number;
  district?: string | null;
  contactName?: string;
  contactPhone?: string;
}

export interface OrderRequest {
  pickup: OrderPoint;
  dropoff: OrderPoint;
  /** ekonomi / standart / acil */
  serviceLevel: ServiceLevel;
  /** serviceLevel === "acil" (geriye uyumluluk) */
  urgent: boolean;
  roundTrip: boolean;
  weightKg: number | null;
  largePackage: boolean;
  packageDescription?: string;
  customerNote?: string;
  /** ISO tarih; boşsa "hemen" */
  scheduledPickupAt: string | null;
  paymentMethod: "kart" | "cari" | "nakit";
}

export class ValidationError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
  }
}

const MAX_SCHEDULE_DAYS = 30;
const PHONE_RE = /^\+?[0-9 ()-]{10,20}$/;

function str(v: unknown, field: string, { required = false, max = 500 } = {}): string | undefined {
  if (v == null || v === "") {
    if (required) throw new ValidationError(`${field} zorunlu`, field);
    return undefined;
  }
  if (typeof v !== "string") throw new ValidationError(`${field} metin olmalı`, field);
  const t = v.trim();
  if (required && !t) throw new ValidationError(`${field} zorunlu`, field);
  if (t.length > max) throw new ValidationError(`${field} çok uzun`, field);
  return t || undefined;
}

function point(v: unknown, field: string): OrderPoint {
  if (!v || typeof v !== "object") throw new ValidationError(`${field} adresi eksik`, field);
  const o = v as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new ValidationError(`${field} konumu geçersiz`, field);
  }
  // Hizmet bölgesi: İstanbul ve yakın çevresi
  if (lat < 40.6 || lat > 41.7 || lng < 27.9 || lng > 30.0) {
    throw new ValidationError(`${field} adresi hizmet bölgesi dışında`, field);
  }
  const contactPhone = str(o.contactPhone, `${field}.contactPhone`, { max: 20 });
  if (contactPhone && !PHONE_RE.test(contactPhone)) {
    throw new ValidationError(`${field} telefon numarası geçersiz`, `${field}.contactPhone`);
  }
  return {
    address: str(o.address, `${field}.address`, { required: true })!,
    details: str(o.details, `${field}.details`),
    lat,
    lng,
    district: str(o.district, `${field}.district`, { max: 60 }) ?? null,
    contactName: str(o.contactName, `${field}.contactName`, { max: 100 }),
    contactPhone,
  };
}

/** Dışarıdan gelen JSON'u doğrular. Hatalar Türkçe mesajlıdır. */
export function parseOrderRequest(body: unknown, now: Date = new Date()): OrderRequest {
  if (!body || typeof body !== "object") throw new ValidationError("İstek gövdesi geçersiz");
  const b = body as Record<string, unknown>;

  let weightKg: number | null = null;
  if (b.weightKg != null && b.weightKg !== "") {
    weightKg = Number(b.weightKg);
    if (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 100) {
      throw new ValidationError("Ağırlık 0–100 kg arasında olmalı", "weightKg");
    }
  }

  let scheduledPickupAt: string | null = null;
  if (b.scheduledPickupAt) {
    const d = new Date(String(b.scheduledPickupAt));
    if (Number.isNaN(d.getTime())) throw new ValidationError("Alış zamanı geçersiz", "scheduledPickupAt");
    if (d.getTime() < now.getTime() - 5 * 60_000) {
      throw new ValidationError("Alış zamanı geçmişte olamaz", "scheduledPickupAt");
    }
    if (d.getTime() > now.getTime() + MAX_SCHEDULE_DAYS * 86_400_000) {
      throw new ValidationError(`En fazla ${MAX_SCHEDULE_DAYS} gün sonrası için planlanabilir`, "scheduledPickupAt");
    }
    scheduledPickupAt = d.toISOString();
  }

  const paymentMethod = (b.paymentMethod ?? "kart") as OrderRequest["paymentMethod"];
  if (!["kart", "cari", "nakit"].includes(paymentMethod)) {
    throw new ValidationError("Ödeme yöntemi geçersiz", "paymentMethod");
  }

  // Eski istemciler yalnız `urgent` gönderir
  let serviceLevel: ServiceLevel = b.urgent === true ? "acil" : "standart";
  if (b.serviceLevel != null && b.serviceLevel !== "") {
    if (!SERVICE_LEVELS.includes(b.serviceLevel as ServiceLevel)) {
      throw new ValidationError("Hizmet seviyesi geçersiz (ekonomi, standart, acil)", "serviceLevel");
    }
    serviceLevel = b.serviceLevel as ServiceLevel;
  }

  return {
    pickup: point(b.pickup, "pickup"),
    dropoff: point(b.dropoff, "dropoff"),
    serviceLevel,
    urgent: serviceLevel === "acil",
    roundTrip: b.roundTrip === true,
    weightKg,
    largePackage: b.largePackage === true,
    packageDescription: str(b.packageDescription, "packageDescription"),
    customerNote: str(b.customerNote, "customerNote", { max: 1000 }),
    scheduledPickupAt,
    paymentMethod,
  };
}

export interface QuoteResult {
  quote: PriceQuote;
  distanceMeters: number;
  returnDistanceMeters: number | null;
  durationSeconds: number;
  pickupSide: IstanbulSide;
  dropoffSide: IstanbulSide;
  bridgeCrossings: number;
}

export interface QuoteDeps {
  maps: MapsProvider;
  settings: PricingSettings;
  holidays: Holiday[];
  now?: Date;
}

export async function buildQuote(req: OrderRequest, deps: QuoteDeps): Promise<QuoteResult> {
  const pickupSide = resolveSide(req.pickup, req.pickup.district);
  const dropoffSide = resolveSide(req.dropoff, req.dropoff.district);
  const [outbound, back] = await Promise.all([
    deps.maps.route(req.pickup, req.dropoff),
    req.roundTrip ? deps.maps.route(req.dropoff, req.pickup) : Promise.resolve(null),
  ]);
  const bridgeCrossings = countBridgeCrossings(pickupSide, dropoffSide);

  const quote = calculatePrice(
    {
      distanceMeters: outbound.distanceMeters,
      returnDistanceMeters: back?.distanceMeters,
      roundTrip: req.roundTrip,
      serviceLevel: req.serviceLevel,
      pickupAt: req.scheduledPickupAt ? new Date(req.scheduledPickupAt) : (deps.now ?? new Date()),
      weightKg: req.weightKg ?? undefined,
      largePackage: req.largePackage,
      bridgeCrossings,
      pickupPoint: { lat: req.pickup.lat, lng: req.pickup.lng },
      holidays: deps.holidays,
    },
    deps.settings,
  );

  return {
    quote,
    distanceMeters: outbound.distanceMeters,
    returnDistanceMeters: back?.distanceMeters ?? null,
    durationSeconds: outbound.durationSeconds + (back?.durationSeconds ?? 0),
    pickupSide,
    dropoffSide,
    bridgeCrossings,
  };
}

/** `orders` tablosuna yazılacak satır (customer_id ve kurumsal hesap çağıran tarafından eklenir). */
export function orderRowFromQuote(req: OrderRequest, q: QuoteResult) {
  return {
    pickup_address: req.pickup.address,
    pickup_details: req.pickup.details ?? null,
    pickup_lat: req.pickup.lat,
    pickup_lng: req.pickup.lng,
    pickup_side: q.pickupSide,
    pickup_contact_name: req.pickup.contactName ?? null,
    pickup_contact_phone: req.pickup.contactPhone ?? null,
    dropoff_address: req.dropoff.address,
    dropoff_details: req.dropoff.details ?? null,
    dropoff_lat: req.dropoff.lat,
    dropoff_lng: req.dropoff.lng,
    dropoff_side: q.dropoffSide,
    dropoff_contact_name: req.dropoff.contactName ?? null,
    dropoff_contact_phone: req.dropoff.contactPhone ?? null,
    package_description: req.packageDescription ?? null,
    weight_kg: req.weightKg,
    large_package: req.largePackage,
    urgent: req.serviceLevel === "acil",
    service_level: req.serviceLevel,
    round_trip: req.roundTrip,
    bridge_crossings: q.bridgeCrossings,
    scheduled_pickup_at: req.scheduledPickupAt,
    customer_note: req.customerNote ?? null,
    distance_meters: q.distanceMeters,
    return_distance_meters: q.returnDistanceMeters,
    duration_seconds: q.durationSeconds,
    price_quote: q.quote,
    subtotal_kurus: q.quote.subtotalKurus,
    vat_kurus: q.quote.vatKurus,
    total_kurus: q.quote.totalKurus,
    payment_method: req.paymentMethod,
  };
}
