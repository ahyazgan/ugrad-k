import type { Holiday, MonthlyInvoice, OrderStatus, PriceQuote, PricingSettings } from "@yazgan/shared";

export interface AdminOrder {
  id: string;
  orderNo: string;
  status: OrderStatus;
  createdAt: string;
  urgent: boolean;
  roundTrip: boolean;
  pickupAddress: string;
  pickupSide: "anadolu" | "avrupa" | null;
  dropoffAddress: string;
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
  distanceMeters: number;
  scheduledPickupAt: string | null;
  deliveredAt: string | null;
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

export interface OrderFilter {
  statuses?: OrderStatus[];
  search?: string;
  /** YYYY-MM-DD (İstanbul) */
  from?: string;
  to?: string;
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
  createCourier(input: { fullName: string; phone: string; plate: string; vehicleModel?: string }): Promise<void>;
  updateCourier(id: string, patch: { active?: boolean; plate?: string; vehicleModel?: string }): Promise<void>;
  listShifts(filter: { from: string; to: string; courierId?: string }): Promise<Shift[]>;
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
  // Fiyatlar
  getPricing(): Promise<{ settings: PricingSettings; holidays: Holiday[]; updatedAt: string | null }>;
  savePricing(settings: PricingSettings): Promise<void>;
  addHoliday(h: Holiday): Promise<void>;
  deleteHoliday(date: string): Promise<void>;
}

export class RepoError extends Error {}
