import type {
  Holiday,
  IstanbulSide,
  MonthlyInvoice,
  OrderStatus,
  PlaceDetails,
  PlaceSuggestion,
  PriceQuote,
  CostModel,
  CourierDocumentKind,
  PricingSettings,
  ServiceLevel,
} from "@yazgan/shared";

export interface AdminOrder {
  id: string;
  orderNo: string;
  status: OrderStatus;
  createdAt: string;
  urgent: boolean;
  serviceLevel: ServiceLevel;
  roundTrip: boolean;
  pickupAddress: string;
  pickupSide: "anadolu" | "avrupa" | null;
  pickupLat: number;
  pickupLng: number;
  dropoffAddress: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffSide: "anadolu" | "avrupa" | null;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  corporateAccountId: string | null;
  courierId: string | null;
  courierName: string | null;
  totalKurus: number;
  subtotalKurus: number;
  paymentMethod: "kart" | "cari" | "nakit";
  paymentStatus: string;
  paidKurus: number | null;
  /** Kuryeye ödemeli siparişte teslimde bildirilen tahsilat */
  cashCollection: CashCollection | null;
  /** Acil teslim taahhüdü (yalnız acil) ve kaçırıldı mı */
  slaDueAt: string | null;
  slaMissed: boolean | null;
  distanceMeters: number;
  scheduledPickupAt: string | null;
  deliveredAt: string | null;
}

export type CashCollection = "nakit" | "iban" | "alinmadi";

/** Teslimat başına kurye hakedişi (courier_earnings) */
export interface EarningRow {
  orderId: string;
  orderNo: string;
  courierId: string;
  courierName: string | null;
  deliveredAt: string;
  km: number;
  jobKurus: number;
  kmKurus: number;
  bonusKurus: number;
  waitingKurus: number;
  bridgeKurus: number;
  totalKurus: number;
  cashCollectedKurus: number;
  payoutId: string | null;
}

export interface CourierPayout {
  id: string;
  courierId: string;
  courierName: string | null;
  untilAt: string;
  deliveryCount: number;
  earningsKurus: number;
  cashKurus: number;
  /** Kuryeye ödenen net; eksi ise kurye şirkete ödedi */
  netKurus: number;
  note: string | null;
  createdAt: string;
  cancelledAt: string | null;
}

/** Teslim edilmiş ama ödemesi gelmemiş kuryeye ödemeli sipariş */
export interface Receivable {
  orderId: string;
  orderNo: string;
  customerName: string | null;
  customerPhone: string | null;
  courierName: string | null;
  deliveredAt: string | null;
  totalKurus: number;
  cashCollection: CashCollection | null;
}

export interface AdminOrderDetail extends AdminOrder {
  pickupDetails: string | null;
  pickupContactName: string | null;
  pickupContactPhone: string | null;
  dropoffDetails: string | null;
  dropoffContactName: string | null;
  dropoffContactPhone: string | null;
  packageDescription: string | null;
  weightKg: number | null;
  customerNote: string | null;
  waitingMinutes: number;
  priceQuote: PriceQuote;
  declaredValueKurus: number | null;
  deliveryCodeRequired: boolean;
  /** Yönetici görür; kurye görmez */
  deliveryCode: string | null;
  deliveryCodeFailedAttempts: number;
  trackingToken: string;
  cancelReason: string | null;
  problemNote: string | null;
  paymentRef: string | null;
  paymentError: string | null;
  podPhotoPath: string | null;
  podSignaturePath: string | null;
  podReceiverName: string | null;
  history: Array<{ fromStatus: OrderStatus | null; toStatus: OrderStatus; at: string; note: string | null }>;
}

export interface Courier {
  id: string;
  fullName: string | null;
  phone: string | null;
  plate: string | null;
  vehicleModel: string | null;
  active: boolean;
  isOnShift: boolean;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: string | null;
  activeOrderCount: number;
}

export interface Shift {
  id: string;
  courierId: string;
  courierName: string | null;
  courierPhone: string | null;
  plate: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface Customer {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  corporateAccountId: string | null;
  createdAt: string;
  orderCount: number;
}

export interface CorporateAccount {
  id: string;
  companyName: string;
  taxOffice: string | null;
  taxNumber: string | null;
  billingAddress: string | null;
  billingEmail: string | null;
  notes: string | null;
}

export interface MonthlyStatement {
  account: CorporateAccount;
  month: string;
  orders: AdminOrder[];
  invoice: MonthlyInvoice;
}

export interface Invoice {
  id: string;
  kind: "order" | "monthly";
  orderId: string | null;
  orderNo: string | null;
  corporateAccountId: string | null;
  period: string | null;
  status: "pending" | "processing" | "issued" | "failed";
  attempts: number;
  lastError: string | null;
  buyerName: string;
  description: string;
  totalKurus: number;
  docType: "e_arsiv" | "e_fatura" | null;
  pdfUrl: string | null;
  issuedAt: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  channel: "whatsapp" | "voice" | "app" | "email";
  externalId: string;
  status: "active" | "closed" | "handoff";
  handoffReason: string | null;
  lastMessageAt: string;
  /** Yalnızca okunabilir metinler (araç çağrıları ve düşünme blokları hariç) */
  transcript: Array<{ role: "user" | "assistant"; text: string }>;
}

export interface PhoneCustomer {
  id: string;
  fullName: string | null;
  email: string | null;
  corporateAccountId: string | null;
  hasConsent: boolean;
  recentAddresses: Array<{
    address: string;
    details: string | null;
    lat: number;
    lng: number;
    contactName: string | null;
    contactPhone: string | null;
  }>;
}

/** quote / create-order gövdesi (packages/shared/quote.ts parseOrderRequest) */
export interface OrderRequestInput {
  pickup: { address: string; details?: string; lat: number; lng: number; district?: string | null; contactName?: string; contactPhone?: string };
  dropoff: { address: string; details?: string; lat: number; lng: number; district?: string | null; contactName?: string; contactPhone?: string };
  serviceLevel: ServiceLevel;
  roundTrip: boolean;
  weightKg: number | null;
  largePackage: boolean;
  declaredValueKurus: number | null;
  deliveryCode: boolean;
  packageDescription?: string;
  customerNote?: string;
  scheduledPickupAt: string | null;
  paymentMethod: "nakit" | "cari" | "kart";
}

export interface AdminQuote {
  quote: PriceQuote;
  distanceMeters: number;
  durationSeconds: number;
  bridgeCrossings: number;
  pickupSide: IstanbulSide;
  dropoffSide: IstanbulSide;
}

export interface OpsSettings {
  unpaidCardTimeoutMinutes: number;
  autoApprove: boolean;
  autoAssign: boolean;
  maxActiveOrdersPerCourier: number;
  maxPickupDistanceKm: number;
  locationMaxAgeMinutes: number;
  unassignedAlertMinutes: number;
  /** Zorunlu belgesi eksik/süresi dolmuş kurye vardiyaya giremez, iş almaz */
  enforceCourierDocuments: boolean;
  /** Belge süresi bu kadar gün kala uyarı */
  documentWarnDays: number;
  /** Acil teslim taahhüdü (dakika) */
  urgentSlaMinutes: number;
}

export interface CourierDocumentRecord {
  courierId: string;
  kind: CourierDocumentKind;
  docNumber: string | null;
  /** YYYY-MM-DD */
  expiresAt: string | null;
  filePath: string | null;
  note: string | null;
  updatedAt: string;
}

export interface DispatchResult {
  approved: number;
  assigned: Array<{ orderId: string; courierId: string; distanceKm: number }>;
  unassigned: string[];
}

export interface OrderFilter {
  statuses?: OrderStatus[];
  search?: string;
  /** YYYY-MM-DD (İstanbul) */
  from?: string;
  to?: string;
  /** En fazla kaç sipariş (varsayılan 500; raporlar için daha fazlası sayfalanarak okunur) */
  limit?: number;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  profileId: string;
  profileName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
export interface WebhookConfig {
  url: string;
  secret: string;
  active: boolean;
}
export interface WebhookDelivery {
  id: number;
  event: string;
  status: "pending" | "processing" | "delivered" | "failed";
  attempts: number;
  lastError: string | null;
  responseStatus: number | null;
  orderNo: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface SystemHealth {
  snapshot: {
    checked_at: string;
    orders_waiting: number;
    orders_problem: number;
    notifications_stuck: number;
    invoices_failed: number;
    webhooks_failed_24h: number;
    couriers_on_shift: number;
    couriers_stale: number;
    heartbeats: Record<string, string>;
  };
  issues: Array<{ key: string; severity: "critical" | "warning"; message: string }>;
}

export interface OrderRating {
  orderId: string;
  orderNo: string;
  score: number;
  comment: string | null;
  courierId: string | null;
  courierName: string | null;
  customerName: string | null;
  createdAt: string;
}

export type LeadStatus = "yeni" | "arandi" | "kazanildi" | "kaybedildi";
export interface Lead {
  id: string;
  kind: "kurumsal" | "iletisim";
  companyName: string | null;
  contactName: string;
  phone: string;
  email: string | null;
  monthlyVolume: string | null;
  message: string | null;
  sourcePage: string | null;
  status: LeadStatus;
  adminNote: string | null;
  createdAt: string;
}

export type ApplicationStatus = "yeni" | "gorusme" | "onaylandi" | "reddedildi";
export interface CourierApplication {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  district: string | null;
  birthYear: number | null;
  licenseClass: string | null;
  hasMotorcycle: boolean;
  plate: string | null;
  vehicleModel: string | null;
  experienceYears: number | null;
  availability: "tam_zamanli" | "yari_zamanli" | "hafta_sonu" | null;
  message: string | null;
  documents: Array<{ kind: string; path: string }>;
  status: ApplicationStatus;
  adminNote: string | null;
  courierId: string | null;
  createdAt: string;
}

export interface AdminRepo {
  readonly mode: "supabase" | "demo";
  // Kimlik
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  currentAdmin(): Promise<{ id: string; fullName: string | null } | null>;
  onAuthChange(cb: () => void): () => void;
  // Siparişler
  listOrders(filter?: OrderFilter): Promise<AdminOrder[]>;
  getOrder(id: string): Promise<AdminOrderDetail>;
  assignCourier(orderId: string, courierId: string): Promise<void>;
  setStatus(orderId: string, status: OrderStatus, note?: string): Promise<void>;
  subscribeOrders(onChange: () => void): () => void;
  podUrl(path: string): Promise<string | null>;
  // Kuryeler
  listCouriers(): Promise<Courier[]>;
  createCourier(input: { fullName: string; phone: string; plate: string; vehicleModel?: string }): Promise<{ id: string }>;
  updateCourier(id: string, patch: { active?: boolean; plate?: string; vehicleModel?: string }): Promise<void>;
  listShifts(filter: { from: string; to: string; courierId?: string }): Promise<Shift[]>;
  // Kurye belgeleri
  listCourierDocuments(courierId?: string): Promise<CourierDocumentRecord[]>;
  saveCourierDocument(
    doc: { courierId: string; kind: CourierDocumentKind; docNumber: string | null; expiresAt: string | null; note: string | null },
    file?: File | null,
  ): Promise<void>;
  deleteCourierDocument(courierId: string, kind: CourierDocumentKind): Promise<void>;
  courierDocumentUrl(path: string): Promise<string | null>;
  // Müşteriler
  listCustomers(search?: string): Promise<Customer[]>;
  setCustomerCorporate(profileId: string, corporateAccountId: string | null): Promise<void>;
  listCorporateAccounts(): Promise<CorporateAccount[]>;
  saveCorporateAccount(acc: Omit<CorporateAccount, "id"> & { id?: string }): Promise<CorporateAccount>;
  monthlyStatement(corporateAccountId: string, month: string): Promise<MonthlyStatement>;
  // Faturalar
  listInvoices(): Promise<Invoice[]>;
  createMonthlyInvoice(corporateAccountId: string, month: string): Promise<void>;
  retryInvoice(id: string): Promise<void>;
  // Otomasyon
  getOpsSettings(): Promise<OpsSettings>;
  saveOpsSettings(s: OpsSettings): Promise<void>;
  runDispatch(): Promise<DispatchResult>;
  getSystemHealth(): Promise<SystemHealth>;
  // Telefon siparişi
  searchPlaces(input: string, sessionToken: string): Promise<PlaceSuggestion[]>;
  placeDetails(placeId: string, sessionToken: string): Promise<PlaceDetails>;
  quote(order: OrderRequestInput): Promise<AdminQuote>;
  lookupPhoneCustomer(phone: string): Promise<PhoneCustomer | null>;
  createPhoneOrder(input: { phone: string; fullName: string; verbalConsent: boolean; order: OrderRequestInput }): Promise<{ id: string; orderNo: string }>;
  /** Tarih aralığındaki değerlendirmeler (YYYY-MM-DD, İstanbul) */
  listRatings(filter: { from: string; to: string }): Promise<OrderRating[]>;
  // Kurumsal API
  listApiKeys(corporateAccountId: string): Promise<ApiKeyInfo[]>;
  /** Anahtarı üretir; düz metin yalnız bu dönüşte görülür */
  createApiKey(corporateAccountId: string, profileId: string, name: string): Promise<{ key: string }>;
  revokeApiKey(id: string): Promise<void>;
  getWebhook(corporateAccountId: string): Promise<WebhookConfig | null>;
  saveWebhook(corporateAccountId: string, cfg: WebhookConfig): Promise<void>;
  listWebhookDeliveries(corporateAccountId: string): Promise<WebhookDelivery[]>;
  // Başvurular (web sitesi)
  listLeads(): Promise<Lead[]>;
  updateLead(id: string, patch: { status?: LeadStatus; adminNote?: string | null }): Promise<void>;
  listCourierApplications(): Promise<CourierApplication[]>;
  updateCourierApplication(id: string, patch: { status?: ApplicationStatus; adminNote?: string | null }): Promise<void>;
  /** Başvuruyu onaylar: kurye hesabı açılır, başvuru "onaylandı" olur */
  approveCourierApplication(id: string, input: { plate: string; vehicleModel?: string }): Promise<{ courierId: string }>;
  applicationDocumentUrl(path: string): Promise<string | null>;
  // Asistan
  listConversations(): Promise<Conversation[]>;
  closeConversation(id: string): Promise<void>;
  // Hakediş ve tahsilat
  getCostModel(): Promise<CostModel>;
  saveCostModel(m: CostModel): Promise<void>;
  /** Teslim edilen siparişlerin hakedişlerini hemen yazar (normalde 5 dakikada bir otomatik) */
  runCourierEarnings(): Promise<{ written: number }>;
  listEarnings(filter: { unpaidOnly?: boolean; courierId?: string; payoutId?: string }): Promise<EarningRow[]>;
  listPayouts(): Promise<CourierPayout[]>;
  createPayout(courierId: string, note?: string): Promise<CourierPayout>;
  cancelPayout(id: string): Promise<void>;
  listReceivables(): Promise<Receivable[]>;
  /** Kuryeye ödemeli siparişin ödemesi (IBAN veya sonradan nakit) alındı */
  markOrderPaid(orderId: string): Promise<void>;
  // Fiyatlar
  getPricing(): Promise<{ settings: PricingSettings; holidays: Holiday[]; updatedAt: string | null }>;
  savePricing(settings: PricingSettings): Promise<void>;
  addHoliday(h: Holiday): Promise<void>;
  deleteHoliday(date: string): Promise<void>;
}

export class RepoError extends Error {}
