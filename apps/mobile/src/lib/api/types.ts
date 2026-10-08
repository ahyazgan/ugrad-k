import type {
  OrderStatus,
  PlaceDetails,
  PlaceSuggestion,
  PriceQuote,
  IstanbulSide,
} from "@yazgan/shared";

export type UserRole = "musteri" | "kurye" | "admin";
export type ConsentType = "kvkk_aydinlatma" | "acik_riza_konum" | "ticari_ileti";

export interface Profile {
  id: string;
  role: UserRole;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  corporateAccountId: string | null;
}

export interface DraftPoint {
  address: string;
  details?: string;
  lat: number;
  lng: number;
  district?: string | null;
  contactName?: string;
  contactPhone?: string;
}

/** create-order / quote Edge Function gövdesi (packages/shared/quote.ts parseOrderRequest) */
export interface OrderInput {
  pickup: DraftPoint;
  dropoff: DraftPoint;
  urgent: boolean;
  roundTrip: boolean;
  weightKg: number | null;
  largePackage: boolean;
  packageDescription?: string;
  customerNote?: string;
  scheduledPickupAt: string | null;
  paymentMethod: "kart" | "cari" | "nakit";
}

export interface QuoteResponse {
  quote: PriceQuote;
  distanceMeters: number;
  returnDistanceMeters: number | null;
  durationSeconds: number;
  pickupSide: IstanbulSide;
  dropoffSide: IstanbulSide;
  bridgeCrossings: number;
}

export interface OrderSummary {
  id: string;
  orderNo: string;
  status: OrderStatus;
  pickupAddress: string;
  dropoffAddress: string;
  totalKurus: number;
  urgent: boolean;
  createdAt: string;
}

export interface OrderDetail extends OrderSummary {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  waitingMinutes: number;
  pickupDetails: string | null;
  dropoffDetails: string | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
  packageDescription: string | null;
  customerNote: string | null;
  roundTrip: boolean;
  weightKg: number | null;
  scheduledPickupAt: string | null;
  priceQuote: PriceQuote;
  paymentMethod: OrderInput["paymentMethod"];
  paymentStatus: string;
  paidKurus: number | null;
  invoicePdfUrl: string | null;
  trackingToken: string;
  courierName: string | null;
  courierPhone: string | null;
  cancelReason: string | null;
  history: { status: OrderStatus; at: string; note: string | null }[];
}

export interface Shift {
  id: string;
  startedAt: string;
}

export interface CourierLocation {
  lat: number;
  lng: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

/** Kuryenin teslim kanıtı: fotoğraf (cihazdaki dosya URI'si) ve/veya imza (SVG) */
export interface ProofOfDelivery {
  photoUri?: string | null;
  signatureSvg?: string | null;
  receiverName: string;
}

export interface Session {
  userId: string;
  phone: string | null;
}

export class ApiError extends Error {
  constructor(message: string, readonly field?: string, readonly status?: number) {
    super(message);
  }
}

export interface Api {
  readonly mode: "supabase" | "demo";
  // Kimlik
  getSession(): Promise<Session | null>;
  onSessionChange(cb: (s: Session | null) => void): () => void;
  sendOtp(phone: string): Promise<void>;
  verifyOtp(phone: string, code: string): Promise<Session>;
  signOut(): Promise<void>;
  // Profil ve KVKK
  getProfile(): Promise<Profile>;
  updateProfile(patch: { fullName?: string; email?: string }): Promise<Profile>;
  getConsents(): Promise<Partial<Record<ConsentType, boolean>>>;
  savePushToken(token: string): Promise<void>;
  saveConsents(items: { type: ConsentType; granted: boolean }[], version: string): Promise<void>;
  // Adres
  searchPlaces(input: string, sessionToken: string): Promise<PlaceSuggestion[]>;
  placeDetails(placeId: string, sessionToken: string): Promise<PlaceDetails>;
  // Sipariş
  quote(input: OrderInput): Promise<QuoteResponse>;
  createOrder(input: OrderInput): Promise<{ id: string; orderNo: string; totalKurus: number }>;
  listOrders(): Promise<OrderSummary[]>;
  getOrder(id: string): Promise<OrderDetail>;
  cancelOrder(id: string, reason: string): Promise<void>;
  /** Kartla ödeme sayfasını başlatır; demo modunda ödeme anında onaylanır (null döner) */
  startPayment(orderId: string): Promise<{ paymentPageUrl: string } | null>;
  subscribeOrder(id: string, onChange: () => void): () => void;
  // Kurye
  getOpenShift(): Promise<Shift | null>;
  startShift(at?: CourierLocation | null): Promise<Shift>;
  endShift(at?: CourierLocation | null): Promise<void>;
  /** Atanmış aktif işler + bugün teslim edilenler */
  listCourierJobs(): Promise<OrderSummary[]>;
  courierAction(
    orderId: string,
    action:
      | { type: "pickup"; waitingMinutes: number }
      | { type: "on_the_way" }
      | { type: "deliver"; pod: ProofOfDelivery }
      | { type: "problem"; note: string }
      | { type: "release"; note: string },
  ): Promise<void>;
  pushLocation(loc: CourierLocation, orderId: string | null): Promise<void>;
  subscribeCourierJobs(onChange: () => void): () => void;
}
