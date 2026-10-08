import type {
  CourierDocument,
  OrderStatus,
  PlaceDetails,
  PlaceSuggestion,
  PriceQuote,
  IstanbulSide,
  ServiceLevel,
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
  serviceLevel: ServiceLevel;
  roundTrip: boolean;
  weightKg: number | null;
  largePackage: boolean;
  declaredValueKurus: number | null;
  deliveryCode: boolean;
  promoCode?: string;
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
  /** Kurye: yanıt bekleyen iş teklifinin son anı (kabul edilmişse veya teklif değilse null) */
  offerExpiresAt?: string | null;
  /** Kurye iş listesi: alış/teslim konumu (mesafe ve durak sırası için) */
  pickupPoint?: { lat: number; lng: number };
  dropoffPoint?: { lat: number; lng: number };
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
  declaredValueKurus: number | null;
  deliveryCodeRequired: boolean;
  /** Müşteriye gösterilir (kurye göremez) */
  deliveryCode: string | null;
  /** Rota süresi (saniye); tahmini teslim için */
  durationSeconds: number | null;
  /** Acil teslim taahhüdü ve kaçırıldı mı */
  slaDueAt: string | null;
  slaMissed: boolean | null;
  /** Kurye alış / teslim adresine vardı (otomatik veya "Vardım") */
  arrivedPickupAt: string | null;
  arrivedDropoffAt: string | null;
  paymentMethod: OrderInput["paymentMethod"];
  paymentStatus: string;
  paidKurus: number | null;
  invoicePdfUrl: string | null;
  trackingToken: string;
  /** Müşterinin verdiği puan (1–5); verilmediyse null */
  rating: number | null;
  courierName: string | null;
  courierPhone: string | null;
  cancelReason: string | null;
  history: { status: OrderStatus; at: string; note: string | null }[];
}

export interface Shift {
  id: string;
  startedAt: string;
  /** Açık mola (yoksa null); auto: yanıtsız teklifler nedeniyle sistem molaya aldı */
  break: { startedAt: string; auto: boolean } | null;
}

export interface CourierLocation {
  lat: number;
  lng: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

/** Müşteriye gösterilen kurye konumu (yalnız teslimat sürerken) */
export interface CourierPosition {
  lat: number;
  lng: number;
  recordedAt: string;
}

/** Kuryenin teslim kanıtı: fotoğraf (cihazdaki dosya URI'si) ve/veya imza (SVG) */
export interface ProofOfDelivery {
  photoUri?: string | null;
  signatureSvg?: string | null;
  receiverName: string;
  /** Kuryeye ödemeli siparişte tahsilat şekli (zorunlu) */
  cashCollection?: CashCollection | null;
}

export type CashCollection = "nakit" | "iban" | "alinmadi";

/** Kurye uygulaması → Kazancım */
export interface CourierEarnings {
  /** Henüz hesaplaşılmamış teslimatlar */
  unpaid: { deliveries: number; earningsKurus: number; cashKurus: number; netKurus: number };
  items: { orderId: string; orderNo: string; deliveredAt: string; km: number; totalKurus: number; cashCollectedKurus: number }[];
  payouts: { id: string; createdAt: string; deliveryCount: number; netKurus: number; note: string | null }[];
  rates: { perJobKurus: number; perKmKurus: number } | null;
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
  /** Hesabı siler (kişisel veriler anonimleştirilir; siparişler mevzuat gereği saklanır) */
  deleteAccount(): Promise<void>;
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
  startPayment(orderId: string, returnUrl?: string): Promise<{ paymentPageUrl: string } | null>;
  subscribeOrder(id: string, onChange: () => void): () => void;
  /** Teslim edilen siparişi puanlar; 5 puanda Google yorum bağlantısı dönebilir */
  rateOrder(order: { id: string; trackingToken: string }, score: number, comment?: string): Promise<{ googleReviewUrl: string | null }>;
  /**
   * Siparişin kurye konumunu izler: hemen ve her değişimde `cb` çağrılır (konum yoksa null).
   * Konum yalnız kurye atandıktan teslime kadar görülebilir (RLS).
   */
  watchCourierLocation(orderId: string, cb: (pos: CourierPosition | null) => void): () => void;
  // Kurye
  getOpenShift(): Promise<Shift | null>;
  startShift(at?: CourierLocation | null): Promise<Shift>;
  endShift(at?: CourierLocation | null): Promise<void>;
  /** Mola: molada otomatik iş gelmez, bekleyen teklifler geri alınır */
  startBreak(): Promise<void>;
  endBreak(): Promise<void>;
  /** Atanmış aktif işler + bugün teslim edilenler */
  listCourierJobs(): Promise<OrderSummary[]>;
  /**
   * İş teklifine yanıt. Süresi dolmuş/geri alınmış teklifte ok=false ve mesaj döner.
   * timeout: geri sayım bitti (kurye yanıt vermedi)
   */
  respondOffer(orderId: string, accept: boolean, opts?: { reason?: string; timeout?: boolean }): Promise<{ ok: boolean; message: string | null }>;
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
  /** Kurye adrese vardığını bildirir (adrese 300 m içinde olmalı) */
  markArrived(orderId: string, stop: "alis" | "teslim", at: CourierLocation | null): Promise<{ arrivedAt: string }>;
  courierEarnings(): Promise<CourierEarnings>;
  /** Müşterinin davet kodu (yoksa üretilir) */
  myReferralCode(): Promise<string>;
  /** Kurye alıcıdan aldığı teslim kodunu doğrular */
  verifyDeliveryCode(orderId: string, code: string): Promise<{ ok: boolean; remaining: number }>;
  /** Kuryenin kendi belgeleri (yönetici girer) */
  courierDocuments(): Promise<CourierDocument[]>;
  subscribeCourierJobs(onChange: () => void): () => void;
}
