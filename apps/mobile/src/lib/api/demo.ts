/**
 * DEMO modu: Supabase anahtarları girilmeden uygulamayı denemek için.
 * Veriler bellekte tutulur; fiyat gerçek pricing.ts/quote.ts ile hesaplanır.
 * Giriş kodu her numara için 123456. Oluşturulan sipariş birkaç saniyede bir
 * otomatik olarak sonraki duruma geçer (canlı takip ekranını göstermek için).
 */
import {
  DEFAULT_PRICING_SETTINGS,
  ORDER_TRANSITIONS,
  buildQuote,
  mockMapsProvider,
  parseOrderRequest,
  ValidationError,
  type OrderStatus,
} from "@yazgan/shared";
import {
  ApiError,
  type Api,
  type ConsentType,
  type OrderDetail,
  type OrderInput,
  type Profile,
  type Session,
} from "./types";

const DEMO_CODE = "123456";
const ADVANCE_MS = 6_000;
const FLOW: OrderStatus[] = ["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda", "teslim_edildi"];

export function createDemoApi(): Api {
  const maps = mockMapsProvider();
  let session: Session | null = null;
  let profile: Profile | null = null;
  const consents: Partial<Record<ConsentType, boolean>> = {};
  const orders = new Map<string, OrderDetail>();
  const listeners = new Set<(s: Session | null) => void>();
  const orderListeners = new Map<string, Set<() => void>>();
  let seq = 1000;

  const emit = () => listeners.forEach((l) => l(session));
  const notify = (id: string) => orderListeners.get(id)?.forEach((l) => l());
  const requireSession = () => {
    if (!session) throw new ApiError("Oturum bulunamadı", undefined, 401);
    return session;
  };

  const quoteFor = async (input: OrderInput) => {
    try {
      const req = parseOrderRequest(input);
      return { req, q: await buildQuote(req, { maps, settings: DEFAULT_PRICING_SETTINGS, holidays: [] }) };
    } catch (e) {
      if (e instanceof ValidationError) throw new ApiError(e.message, e.field, 400);
      throw e;
    }
  };

  function scheduleAdvance(id: string) {
    setTimeout(() => {
      const o = orders.get(id);
      if (!o) return;
      const next = FLOW[FLOW.indexOf(o.status) + 1];
      if (!next || !ORDER_TRANSITIONS[o.status].includes(next)) return;
      o.status = next;
      o.history.push({ status: next, at: new Date().toISOString(), note: null });
      if (next === "kuryeye_atandi") {
        o.courierName = "Mehmet (demo)";
        o.courierPhone = "+905550000000";
      }
      notify(id);
      scheduleAdvance(id);
    }, ADVANCE_MS);
  }

  return {
    mode: "demo",

    async getSession() {
      return session;
    },
    onSessionChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async sendOtp(phone) {
      if (phone.replace(/\D/g, "").replace(/^(90|0)/, "").length !== 10) {
        throw new ApiError("Geçerli bir cep telefonu numarası girin", "phone");
      }
    },
    async verifyOtp(phone, code) {
      if (code !== DEMO_CODE) throw new ApiError(`Kod hatalı (demo kodu: ${DEMO_CODE})`, "code");
      session = { userId: "demo-user", phone };
      profile ??= { id: "demo-user", role: "musteri", fullName: null, phone, email: null, corporateAccountId: null };
      emit();
      return session;
    },
    async signOut() {
      session = null;
      emit();
    },

    async getProfile() {
      requireSession();
      return profile!;
    },
    async updateProfile(patch) {
      requireSession();
      profile = { ...profile!, fullName: patch.fullName ?? profile!.fullName, email: patch.email ?? profile!.email };
      return profile;
    },
    async getConsents() {
      requireSession();
      return { ...consents };
    },
    async saveConsents(items) {
      requireSession();
      for (const i of items) consents[i.type] = i.granted;
    },

    searchPlaces: (input, token) => maps.autocomplete(input, token),
    placeDetails: (id, token) => maps.placeDetails(id, token),

    async quote(input) {
      requireSession();
      const { q } = await quoteFor(input);
      return q;
    },
    async createOrder(input) {
      requireSession();
      if (!consents.kvkk_aydinlatma || !consents.acik_riza_konum) {
        throw new ApiError("Sipariş için KVKK onayı gerekiyor", undefined, 403);
      }
      const { req, q } = await quoteFor(input);
      const id = `demo-${++seq}`;
      const now = new Date().toISOString();
      orders.set(id, {
        id,
        orderNo: `YK-${seq}`,
        status: "beklemede",
        pickupAddress: req.pickup.address,
        dropoffAddress: req.dropoff.address,
        totalKurus: q.quote.totalKurus,
        urgent: req.urgent,
        createdAt: now,
        pickupDetails: req.pickup.details ?? null,
        dropoffDetails: req.dropoff.details ?? null,
        pickupContactName: req.pickup.contactName ?? null,
        pickupContactPhone: req.pickup.contactPhone ?? null,
        dropoffContactName: req.dropoff.contactName ?? null,
        dropoffContactPhone: req.dropoff.contactPhone ?? null,
        packageDescription: req.packageDescription ?? null,
        customerNote: req.customerNote ?? null,
        roundTrip: req.roundTrip,
        weightKg: req.weightKg,
        scheduledPickupAt: req.scheduledPickupAt,
        priceQuote: q.quote,
        paymentMethod: req.paymentMethod,
        paymentStatus: "odenmedi",
        trackingToken: "demo".padEnd(32, "0"),
        courierName: null,
        courierPhone: null,
        cancelReason: null,
        history: [{ status: "beklemede", at: now, note: null }],
      });
      scheduleAdvance(id);
      return { id, orderNo: `YK-${seq}`, totalKurus: q.quote.totalKurus };
    },
    async listOrders() {
      requireSession();
      return [...orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getOrder(id) {
      const o = orders.get(id);
      if (!o) throw new ApiError("Sipariş bulunamadı", undefined, 404);
      return structuredClone(o);
    },
    async cancelOrder(id, reason) {
      const o = orders.get(id);
      if (!o) throw new ApiError("Sipariş bulunamadı", undefined, 404);
      if (!["beklemede", "onaylandi"].includes(o.status)) {
        throw new ApiError("Kurye yola çıktıktan sonra sipariş iptal edilemez");
      }
      o.status = "iptal";
      o.cancelReason = reason;
      o.history.push({ status: "iptal", at: new Date().toISOString(), note: reason });
      notify(id);
    },
    subscribeOrder(id, onChange) {
      const set = orderListeners.get(id) ?? new Set();
      set.add(onChange);
      orderListeners.set(id, set);
      return () => set.delete(onChange);
    },
  };
}
