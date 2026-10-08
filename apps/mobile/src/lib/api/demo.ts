/**
 * DEMO modu: Supabase anahtarları girilmeden uygulamayı denemek için.
 * Veriler bellekte tutulur; fiyat gerçek pricing.ts/quote.ts ile hesaplanır.
 * Giriş kodu her numara için 123456. Oluşturulan sipariş birkaç saniyede bir
 * otomatik olarak sonraki duruma geçer (canlı takip ekranını göstermek için).
 * 0555 000 00 00 numarasıyla giriş yapılırsa KURYE ekranları açılır.
 */
import {
  applyPromo,
  applyWaitingFee,
  courierBalance,
  courierEarning,
  DEFAULT_COST_MODEL,
  DEFAULT_PRICING_SETTINGS,
  istanbulDay,
  ORDER_TRANSITIONS,
  buildQuote,
  mockMapsProvider,
  normalizeCode,
  parseOrderRequest,
  promoDiscountKurus,
  promoLabel,
  PricingError,
  ValidationError,
  type OrderStatus,
} from "@yazgan/shared";
import {
  ApiError,
  type Api,
  type CashCollection,
  type Shift,
  type ConsentType,
  type CourierPosition,
  type OrderDetail,
  type OrderInput,
  type Profile,
  type Session,
} from "./types";

const DEMO_CODE = "123456";
export const DEMO_COURIER_PHONE = "5550000000";
const ADVANCE_MS = 6_000;
const FLOW: OrderStatus[] = ["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda", "teslim_edildi"];

/** Demo: kurye atanınca alış noktasına yaklaşır, yolda iken teslim noktasına ilerler */
function demoCourierPosition(o: OrderDetail | undefined): CourierPosition | null {
  if (!o || !["kuryeye_atandi", "alindi", "yolda"].includes(o.status)) return null;
  const since = (s: OrderStatus) => {
    const at = [...o.history].reverse().find((h) => h.status === s)?.at;
    return at ? Date.now() - new Date(at).getTime() : 0;
  };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
  if (o.status === "yolda") {
    const t = since("yolda") / (ADVANCE_MS * 1.2);
    return { lat: lerp(o.pickupLat, o.dropoffLat, t), lng: lerp(o.pickupLng, o.dropoffLng, t), recordedAt: new Date().toISOString() };
  }
  if (o.status === "alindi") return { lat: o.pickupLat, lng: o.pickupLng, recordedAt: new Date().toISOString() };
  const t = since("kuryeye_atandi") / (ADVANCE_MS * 1.2);
  return { lat: lerp(o.pickupLat + 0.012, o.pickupLat, t), lng: lerp(o.pickupLng - 0.015, o.pickupLng, t), recordedAt: new Date().toISOString() };
}

export function createDemoApi(): Api {
  const maps = mockMapsProvider();
  let session: Session | null = null;
  let profile: Profile | null = null;
  const consents: Partial<Record<ConsentType, boolean>> = {};
  const orders = new Map<string, OrderDetail>();
  const listeners = new Set<(s: Session | null) => void>();
  const orderListeners = new Map<string, Set<() => void>>();
  const jobListeners = new Set<() => void>();
  let shift: Shift | null = null;
  let seq = 1000;
  let courierSeeded = false;
  /** Teslimde bildirilen tahsilat (yalnız kuryeye ödemeli siparişler) */
  const cash = new Map<string, CashCollection>();
  const codeTries = new Map<string, number>();
  const codeVerified = new Set<string>();
  const notifyJobs = () => jobListeners.forEach((l) => l());

  const emit = () => listeners.forEach((l) => l(session));
  const notify = (id: string) => orderListeners.get(id)?.forEach((l) => l());
  const requireSession = () => {
    if (!session) throw new ApiError("Oturum bulunamadı", undefined, 401);
    return session;
  };

  const detailFrom = (
    id: string,
    req: ReturnType<typeof parseOrderRequest>,
    q: Awaited<ReturnType<typeof buildQuote>>,
    now: string,
  ): OrderDetail => ({
    id,
    orderNo: `YK-${seq}`,
    status: "beklemede",
    pickupAddress: req.pickup.address,
    dropoffAddress: req.dropoff.address,
    pickupLat: req.pickup.lat,
    pickupLng: req.pickup.lng,
    dropoffLat: req.dropoff.lat,
    dropoffLng: req.dropoff.lng,
    waitingMinutes: 0,
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
    durationSeconds: q.durationSeconds,
    declaredValueKurus: req.declaredValueKurus,
    deliveryCodeRequired: req.deliveryCode,
    deliveryCode: req.deliveryCode ? "4821" : null,
    slaDueAt: req.serviceLevel === "acil" ? new Date(new Date(now).getTime() + 60 * 60_000).toISOString() : null,
    slaMissed: null,
    paymentMethod: req.paymentMethod,
    paymentStatus: "odenmedi",
    paidKurus: null,
    invoicePdfUrl: null,
    rating: null,
    trackingToken: "demo".padEnd(32, "0"),
    courierName: null,
    courierPhone: null,
    cancelReason: null,
    history: [{ status: "beklemede", at: now, note: null }],
  });

  const quoteFor = async (input: OrderInput) => {
    try {
      const req = parseOrderRequest(input);
      const q = await buildQuote(req, { maps, settings: DEFAULT_PRICING_SETTINGS, holidays: [] });
      // Demo kampanya kodu: HOSGELDIN (%20); diğer kodlar bulunamaz
      if (req.promoCode) {
        if (normalizeCode(req.promoCode) !== "HOSGELDIN") throw new ApiError("Kod bulunamadı", "promoCode", 400);
        const p = { code: "HOSGELDIN", kind: "yuzde" as const, value: 20, maxDiscountKurus: null };
        q.quote = applyPromo(q.quote, promoLabel(p), promoDiscountKurus(p, q.quote));
      }
      return { req, q };
    } catch (e) {
      if (e instanceof ValidationError) throw new ApiError(e.message, e.field, 400);
      if (e instanceof PricingError) throw new ApiError(e.message, undefined, 400);
      throw e;
    }
  };

  /** Demo kuryesine bir atanmış iş ve iki iş teklifi (2 dk süreli) verir */
  async function seedCourierJobs() {
    if (courierSeeded) return;
    courierSeeded = true;
    const routes: [string, string, boolean, boolean][] = [
      ["mock-beykoz", "mock-levent", true, false],
      ["mock-uskudar", "mock-kadikoy", false, true],
      ["mock-kadikoy", "mock-atasehir", false, true],
    ];
    for (const [from, to, urgent, offer] of routes) {
      const pickup = await maps.placeDetails(from);
      const dropoff = await maps.placeDetails(to);
      const { req, q } = await quoteFor({
        pickup: { ...pickup, contactName: "Ayşe Gönderici", contactPhone: "+905321112233" },
        dropoff: { ...dropoff, contactName: "Ali Alıcı", contactPhone: "+905334445566" },
        serviceLevel: urgent ? "acil" : "standart",
        roundTrip: false,
        weightKg: null,
        largePackage: false,
        declaredValueKurus: null,
        // İlk demo işi teslim kodlu (kod: 4821)
        deliveryCode: urgent,
        packageDescription: "İmzalı sözleşme zarfı",
        customerNote: "Resepsiyona bırakılabilir",
        scheduledPickupAt: null,
        paymentMethod: "nakit",
      });
      const id = `demo-${++seq}`;
      const now = new Date().toISOString();
      orders.set(id, {
        ...detailFrom(id, req, q, now),
        status: "kuryeye_atandi",
        courierName: "Demo Kurye",
        offerExpiresAt: offer ? new Date(Date.now() + 120_000).toISOString() : null,
        pickupPoint: { lat: req.pickup.lat, lng: req.pickup.lng },
        dropoffPoint: { lat: req.dropoff.lat, lng: req.dropoff.lng },
        history: [
          { status: "beklemede", at: now, note: null },
          { status: "onaylandi", at: now, note: null },
          { status: "kuryeye_atandi", at: now, note: offer ? "Otomatik atama (teklif)" : null },
        ],
      });
    }
  }

  function move(id: string, to: OrderStatus, note: string | null = null) {
    const o = orders.get(id);
    if (!o) throw new ApiError("Sipariş bulunamadı", undefined, 404);
    if (!ORDER_TRANSITIONS[o.status].includes(to)) {
      throw new ApiError(`Bu işlem şu an yapılamaz (${o.status} → ${to})`);
    }
    o.status = to;
    o.history.push({ status: to, at: new Date().toISOString(), note });
    notify(id);
    notifyJobs();
    return o;
  }

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
      const courier = phone.replace(/\D/g, "").endsWith(DEMO_COURIER_PHONE);
      session = { userId: courier ? "demo-courier" : "demo-user", phone };
      profile = {
        id: session.userId,
        role: courier ? "kurye" : "musteri",
        fullName: courier ? "Demo Kurye" : (profile?.fullName ?? null),
        phone,
        email: null,
        corporateAccountId: null,
      };
      emit();
      return session;
    },
    async signOut() {
      session = null;
      emit();
    },
    async deleteAccount() {
      const active = [...orders.values()].some((o) => ["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda", "sorunlu"].includes(o.status) && o.courierName !== "Demo Kurye");
      if (active) throw new ApiError("Devam eden siparişiniz varken hesap silinemez");
      orders.clear();
      profile = null;
      for (const k of Object.keys(consents)) delete consents[k as ConsentType];
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
    async savePushToken() {
      // Demo: push gönderilmez
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
      orders.set(id, detailFrom(id, req, q, now));
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
    async startPayment(orderId) {
      const o = orders.get(orderId);
      if (!o) throw new ApiError("Sipariş bulunamadı", undefined, 404);
      o.paymentStatus = "odendi";
      o.paidKurus = o.totalKurus;
      notify(orderId);
      return null;
    },
    async rateOrder(order, score) {
      const o = orders.get(order.id);
      if (!o) throw new ApiError("Sipariş bulunamadı", undefined, 404);
      if (o.status !== "teslim_edildi") throw new ApiError("Sipariş teslim edildikten sonra değerlendirebilirsiniz");
      if (o.rating) throw new ApiError("Bu sipariş zaten değerlendirildi");
      o.rating = score;
      notify(o.id);
      return { googleReviewUrl: score === 5 ? "https://www.google.com/maps" : null };
    },
    subscribeOrder(id, onChange) {
      const set = orderListeners.get(id) ?? new Set();
      set.add(onChange);
      orderListeners.set(id, set);
      return () => set.delete(onChange);
    },

    watchCourierLocation(orderId, cb) {
      const tick = () => cb(demoCourierPosition(orders.get(orderId)));
      tick();
      const timer = setInterval(tick, 2_000);
      return () => clearInterval(timer);
    },

    // ───────── Kurye
    async getOpenShift() {
      return shift;
    },
    async startShift() {
      shift ??= { id: "demo-shift", startedAt: new Date().toISOString() };
      await seedCourierJobs();
      notifyJobs();
      return shift;
    },
    async endShift() {
      shift = null;
      notifyJobs();
    },
    async listCourierJobs() {
      requireSession();
      return [...orders.values()]
        .filter((o) => o.courierName === "Demo Kurye")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async respondOffer(orderId, accept, opts = {}) {
      const o = orders.get(orderId);
      if (!o || !o.offerExpiresAt || o.status !== "kuryeye_atandi" || o.courierName !== "Demo Kurye") {
        return { ok: false, message: "Bu teklif artık geçerli değil" };
      }
      const expired = Date.now() > new Date(o.offerExpiresAt).getTime() + 10_000;
      if (accept && !expired) {
        o.offerExpiresAt = null;
        notify(orderId);
        notifyJobs();
        return { ok: true, message: null };
      }
      const timedOut = !!opts.timeout || expired;
      const back = move(orderId, "onaylandi", timedOut ? "Teklif süresi doldu" : `Teklif reddedildi${opts.reason ? `: ${opts.reason}` : ""}`);
      back.courierName = null;
      back.offerExpiresAt = null;
      notifyJobs();
      return accept ? { ok: false, message: "Teklifin süresi doldu; iş başka kuryeye verilecek" } : { ok: true, message: null };
    },
    async courierAction(orderId, action) {
      if (orders.get(orderId)?.offerExpiresAt && action.type !== "release") throw new ApiError("Önce işi kabul edin");
      switch (action.type) {
        case "pickup": {
          const o = move(orderId, "alindi");
          o.waitingMinutes = action.waitingMinutes;
          o.priceQuote = applyWaitingFee(o.priceQuote, action.waitingMinutes, DEFAULT_PRICING_SETTINGS);
          o.totalKurus = o.priceQuote.totalKurus;
          return;
        }
        case "on_the_way":
          move(orderId, "yolda");
          return;
        case "problem":
          move(orderId, "sorunlu", action.note);
          return;
        case "release": {
          const o = move(orderId, "onaylandi", action.note);
          o.courierName = null;
          notifyJobs();
          return;
        }
        case "deliver": {
          if (!action.pod.photoUri && !action.pod.signatureSvg) {
            throw new ApiError("Teslim için fotoğraf veya imza gerekli");
          }
          const o = orders.get(orderId);
          if (o?.deliveryCodeRequired && !codeVerified.has(orderId)) {
            throw new ApiError("Alıcının teslim kodu doğrulanmadı");
          }
          if (o?.paymentMethod === "nakit" && o.paymentStatus !== "odendi" && !action.pod.cashCollection) {
            throw new ApiError("Kuryeye ödemeli siparişte tahsilat bilgisi gerekli");
          }
          if (o && action.pod.cashCollection) {
            cash.set(orderId, action.pod.cashCollection);
            if (action.pod.cashCollection === "nakit") {
              o.paymentStatus = "odendi";
              o.paidKurus = o.totalKurus;
            }
          }
          move(orderId, "teslim_edildi");
          return;
        }
      }
    },
    async pushLocation() {
      // Demo: konum sunucuya gönderilmez
    },
    async courierEarnings() {
      requireSession();
      const items = [...orders.values()]
        .filter((o) => o.courierName === "Demo Kurye" && o.status === "teslim_edildi")
        .map((o) => {
          const e = courierEarning(o.priceQuote, DEFAULT_COST_MODEL, DEFAULT_PRICING_SETTINGS);
          return {
            orderId: o.id,
            orderNo: o.orderNo,
            deliveredAt: [...o.history].reverse().find((h) => h.status === "teslim_edildi")?.at ?? new Date().toISOString(),
            km: e.km,
            totalKurus: e.totalKurus,
            cashCollectedKurus: cash.get(o.id) === "nakit" ? o.totalKurus : 0,
          };
        })
        .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));
      return {
        unpaid: courierBalance(items),
        items,
        payouts: [],
        rates: { perJobKurus: DEFAULT_COST_MODEL.courierPerJobKurus, perKmKurus: DEFAULT_COST_MODEL.courierPerKmKurus },
      };
    },
    async verifyDeliveryCode(orderId, code) {
      const o = orders.get(orderId);
      if (!o?.deliveryCode) return { ok: true, remaining: 5 };
      const tries = (codeTries.get(orderId) ?? 0);
      if (tries >= 5) throw new ApiError("Teslim kodu 5 kez yanlış girildi; yöneticiyi arayın");
      if (code.trim() === o.deliveryCode) {
        codeVerified.add(orderId);
        return { ok: true, remaining: 5 - tries };
      }
      codeTries.set(orderId, tries + 1);
      return { ok: false, remaining: 4 - tries };
    },
    async myReferralCode() {
      requireSession();
      return "DEMO23";
    },
    async courierDocuments() {
      requireSession();
      const day = (n: number) => istanbulDay(new Date(Date.now() + n * 86_400_000));
      return [
        { kind: "ehliyet", number: "A2-348812", expiresAt: day(1400) },
        { kind: "kurye_faaliyet_belgesi", number: "KFB-2026-11873", expiresAt: day(500) },
        { kind: "ruhsat", number: null, expiresAt: null },
        { kind: "trafik_sigortasi", number: null, expiresAt: day(10) },
      ];
    },
    subscribeCourierJobs(onChange) {
      jobListeners.add(onChange);
      return () => jobListeners.delete(onChange);
    },
  };
}
