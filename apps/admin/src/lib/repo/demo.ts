"use client";

/**
 * DEMO veri kaynağı: Supabase bağlanmadan paneli denemek için.
 * Giriş: admin@yazgankurye.com / demo1234. Veriler tarayıcı belleğinde tutulur.
 */
import {
  DEFAULT_PRICING_SETTINGS,
  ORDER_TRANSITIONS,
  applyFailedDeliveryReturn,
  buildQuote,
  calculateMonthlyInvoice,
  courierCompliance,
  courierEarning,
  DEFAULT_COST_MODEL,
  istanbulDay,
  monthlyInvoiceItem,
  mockMapsProvider,
  MOCK_PLACES,
  parseOrderRequest,
  planAssignments,
  ValidationError,
  type CostModel,
  type Holiday,
  type OrderStatus,
  type PricingSettings,
} from "@yazgan/shared";
import holidaysJson from "../../../../../docs/resmi-tatiller.json";
import { istDayEndUtc, istDayStartUtc, istMonthRangeUtc } from "../dates";
import {
  RepoError,
  type AdminOrder,
  type AdminOrderDetail,
  type AdminRepo,
  type CorporateAccount,
  type Courier,
  type CourierDocumentRecord,
  type CourierPayout,
  type EarningRow,
  type PromoCodeRow,
  type Incident,
  type OrderMessage,
  type ReadinessItem,
  type Conversation,
  type Customer,
  type Invoice,
  type OpsSettings,
  type PhoneCustomer,
  type Shift,
  type CourierApplication,
  type Lead,
  type ApiKeyInfo,
  type OrderRating,
  type WebhookConfig,
} from "./types";
import { generateApiKey, keyPrefix } from "../api-keys";

const DEMO_EMAIL = "admin@yazgankurye.com";
const DEMO_PASSWORD = "demo1234";

interface State {
  signedIn: boolean;
  settings: PricingSettings;
  holidays: Holiday[];
  couriers: Courier[];
  customers: Customer[];
  corporate: CorporateAccount[];
  orders: AdminOrderDetail[];
  shifts: Shift[];
  incidents: Incident[];
  messages: Array<OrderMessage & { orderId: string }>;
  invoices: Invoice[];
  conversations: Conversation[];
  ops: OpsSettings;
  /** KVKK onayı verilmiş müşteri kimlikleri */
  consented: Set<string>;
  leads: Lead[];
  applications: CourierApplication[];
  apiKeys: Array<ApiKeyInfo & { accountId: string }>;
  webhooks: Map<string, WebhookConfig>;
  costModel: CostModel;
  promos: PromoCodeRow[];
  documents: CourierDocumentRecord[];
  earnings: EarningRow[];
  payouts: CourierPayout[];
}

/** Acil siparişte 60 dk taahhüt (veritabanındaki orders_sla tetikleyicisiyle aynı kural, demo) */
function demoSla(urgent: boolean, createdAt: string, deliveredAt: string | null) {
  if (!urgent) return { slaDueAt: null, slaMissed: null };
  const due = new Date(new Date(createdAt).getTime() + 60 * 60_000).toISOString();
  return { slaDueAt: due, slaMissed: deliveredAt ? deliveredAt > due : null };
}

const dayOffset = (days: number) => istanbulDay(new Date(Date.now() + days * 86_400_000));
/** Mehmet'in belgeleri tam (sigortası 12 gün içinde bitiyor); Emre'nin kurye faaliyet belgesi eksik */
function demoDocuments(): CourierDocumentRecord[] {
  const doc = (courierId: string, kind: CourierDocumentRecord["kind"], expiresAt: string | null, docNumber: string | null = null): CourierDocumentRecord => ({
    courierId,
    kind,
    docNumber,
    expiresAt,
    filePath: null,
    note: null,
    updatedAt: hoursAgo(200),
  });
  return [
    doc("kur-1", "ehliyet", dayOffset(1400), "A2-348812"),
    doc("kur-1", "kurye_faaliyet_belgesi", dayOffset(500), "KFB-2026-11873"),
    doc("kur-1", "ruhsat", null),
    doc("kur-1", "trafik_sigortasi", dayOffset(12)),
    doc("kur-1", "src", dayOffset(900)),
    doc("kur-2", "ehliyet", dayOffset(2000)),
    doc("kur-2", "ruhsat", null),
    doc("kur-2", "trafik_sigortasi", dayOffset(200)),
  ];
}

/** Teslim edilmiş siparişin hakediş satırı (Edge Function courier-earnings ile aynı hesap) */
function earningFor(o: AdminOrderDetail, model: CostModel, settings: PricingSettings): EarningRow {
  const e = courierEarning(o.priceQuote, model, settings);
  return {
    orderId: o.id,
    orderNo: o.orderNo,
    courierId: o.courierId!,
    courierName: o.courierName,
    deliveredAt: o.deliveredAt ?? new Date().toISOString(),
    km: e.km,
    jobKurus: e.jobKurus,
    kmKurus: e.kmKurus,
    bonusKurus: e.bonusKurus,
    waitingKurus: e.waitingKurus,
    bridgeKurus: e.bridgeKurus,
    totalKurus: e.totalKurus,
    cashCollectedKurus: o.paymentMethod === "nakit" && o.cashCollection === "nakit" ? o.totalKurus : 0,
    payoutId: null,
  };
}

const phoneDigits = (p: string) => p.replace(/\D/g, "").replace(/^(90|0)/, "");
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

async function seed(): Promise<State> {
  const maps = mockMapsProvider();
  const corporate: CorporateAccount[] = [
    {
      id: "corp-1",
      companyName: "Beykoz Hukuk Bürosu",
      taxOffice: "Beykoz",
      taxNumber: "1234567890",
      billingAddress: "Beykoz/İstanbul",
      billingEmail: "muhasebe@ornek-hukuk.com",
      notes: null,
    },
  ];
  const customers: Customer[] = [
    { id: "cus-1", fullName: "Ayşe Yılmaz", phone: "+905321112233", email: null, corporateAccountId: null, createdAt: hoursAgo(400), orderCount: 0 },
    { id: "cus-3", fullName: "Kaan Öztürk", phone: "+905367778899", email: null, corporateAccountId: null, createdAt: hoursAgo(800), orderCount: 0 },
    { id: "cus-2", fullName: "Av. Murat Demir", phone: "+905334445566", email: "murat@ornek-hukuk.com", corporateAccountId: "corp-1", createdAt: hoursAgo(900), orderCount: 0 },
  ];
  const couriers: Courier[] = [
    { id: "kur-1", fullName: "Mehmet Kaya", phone: "+905551110001", plate: "34 YZG 01", vehicleModel: "Honda PCX 125", active: true, isOnShift: true, onBreak: false, lastLat: 41.08, lastLng: 29.06, lastLocationAt: hoursAgo(0.05), activeOrderCount: 0 },
    { id: "kur-2", fullName: "Emre Şahin", phone: "+905551110002", plate: "34 YZG 02", vehicleModel: "Yamaha NMAX", active: true, isOnShift: false, onBreak: false, lastLat: null, lastLng: null, lastLocationAt: null, activeOrderCount: 0 },
  ];
  const place = (id: string) => MOCK_PLACES.find((p) => p.placeId === id)!;
  const specs: Array<[string, string, string, OrderStatus, number, boolean, string | null]> = [
    ["cus-2", "mock-beykoz", "mock-levent", "beklemede", 0.2, true, null],
    ["cus-1", "mock-kadikoy", "mock-atasehir", "onaylandi", 0.6, false, null],
    ["cus-2", "mock-beykoz", "mock-sisli", "yolda", 1.5, false, "kur-1"],
    ["cus-1", "mock-uskudar", "mock-kartal", "teslim_edildi", 26, false, "kur-1"],
    ...Array.from({ length: 21 }, (_, i): [string, string, string, OrderStatus, number, boolean, string | null] => [
      "cus-2",
      "mock-beykoz",
      i % 2 ? "mock-taksim" : "mock-umraniye",
      "teslim_edildi",
      30 + i * 5,
      i % 5 === 0,
      i % 2 ? "kur-1" : "kur-2",
    ]),
  ];
  // Raporlar için ~4 haftalık geçmiş: sabit tohumlu sözde rastgele (her açılışta aynı veri)
  let rnd = 7;
  const next = () => ((rnd = (rnd * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = <T,>(xs: T[]) => xs[Math.floor(next() * xs.length)]!;
  const HOURS = [8, 9, 9, 10, 10, 10, 11, 11, 12, 13, 14, 14, 15, 15, 16, 16, 17, 18, 19, 21, 23];
  const ANADOLU = ["mock-beykoz", "mock-kadikoy", "mock-uskudar", "mock-atasehir", "mock-umraniye", "mock-kartal"];
  const ALL = [...ANADOLU, "mock-levent", "mock-sisli", "mock-taksim", "mock-bakirkoy"];
  const deliveryMin = new Map<number, number>();
  for (let day = 7; day <= 28; day++) {
    const dow = new Date(Date.now() - day * 86_400_000).getUTCDay();
    const n = dow === 0 ? 0 : dow === 6 ? 1 : 1 + Math.floor(next() * 3);
    for (let k = 0; k < n; k++) {
      const at = new Date(Date.now() - day * 86_400_000);
      at.setUTCHours(pick(HOURS) - 3, Math.floor(next() * 60), 0, 0);
      const cancelled = next() < 0.08;
      const urgent = next() < 0.3;
      deliveryMin.set(specs.length, urgent ? 32 + Math.floor(next() * 40) : 45 + Math.floor(next() * 75));
      specs.push([
        next() < 0.6 ? "cus-3" : "cus-1",
        pick(ANADOLU),
        pick(ALL),
        cancelled ? "iptal" : "teslim_edildi",
        (Date.now() - at.getTime()) / 3_600_000,
        urgent,
        cancelled ? null : next() < 0.55 ? "kur-1" : "kur-2",
      ]);
    }
  }
  const orders: AdminOrderDetail[] = [];
  let no = 1000;
  for (const [idx, [customerId, from, to, status, ago, urgent, courierId]] of specs.entries()) {
    const p = place(from);
    const d = place(to === from ? "mock-levent" : to);
    const createdAt = hoursAgo(ago);
    const q = await buildQuote(
      {
        pickup: p,
        dropoff: d,
        serviceLevel: urgent ? "acil" : "standart",
        urgent,
        roundTrip: false,
        weightKg: null,
        largePackage: false,
        declaredValueKurus: null,
        deliveryCode: false,
        scheduledPickupAt: null,
        paymentMethod: customerId === "cus-2" ? "cari" : "nakit",
      },
      { maps, settings: DEFAULT_PRICING_SETTINGS, holidays: [], now: new Date(createdAt) },
    );
    const cust = customers.find((c) => c.id === customerId)!;
    cust.orderCount++;
    const flow: OrderStatus[] = ["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda", "teslim_edildi"];
    const reached = status === "iptal" ? (["beklemede", "iptal"] as OrderStatus[]) : flow.slice(0, flow.indexOf(status) + 1);
    orders.push({
      id: `ord-${++no}`,
      orderNo: `YK-${no}`,
      status,
      createdAt,
      urgent,
      serviceLevel: urgent ? "acil" : "standart",
      roundTrip: false,
      pickupAddress: p.address,
      pickupSide: p.side,
      pickupLat: p.lat,
      pickupLng: p.lng,
      dropoffLat: d.lat,
      dropoffLng: d.lng,
      dropoffAddress: d.address,
      dropoffSide: d.side,
      customerId,
      customerName: cust.fullName,
      customerPhone: cust.phone,
      corporateAccountId: cust.corporateAccountId,
      courierId,
      courierName: couriers.find((c) => c.id === courierId)?.fullName ?? null,
      totalKurus: q.quote.totalKurus,
      subtotalKurus: q.quote.subtotalKurus,
      paymentMethod: cust.corporateAccountId ? "cari" : "nakit",
      paymentStatus: cust.corporateAccountId ? "cari_hesap" : "odenmedi",
      paidKurus: null,
      cashCollection: null,
      ...demoSla(urgent, createdAt, status === "teslim_edildi" ? hoursAgo(ago - (deliveryMin.get(idx) ?? 60) / 60) : null),
      distanceMeters: q.distanceMeters,
      scheduledPickupAt: null,
      deliveredAt: status === "teslim_edildi" ? hoursAgo(ago - (deliveryMin.get(idx) ?? 60) / 60) : null,
      failedReason: null,
      returnedAt: null,
      failedAt: null,
      failedNote: null,
      failedCallAttempts: null,
      failedPhotoPath: null,
      returnPodPhotoPath: null,
      returnPodSignaturePath: null,
      returnReceiverName: null,
      pickupDetails: "Kat 2",
      pickupContactName: cust.fullName,
      pickupContactPhone: cust.phone,
      dropoffDetails: "Resepsiyon",
      dropoffContactName: "Alıcı",
      dropoffContactPhone: "+905000000000",
      packageDescription: "Evrak",
      weightKg: null,
      customerNote: null,
      waitingMinutes: 0,
      waitingSource: null,
      arrivedPickupAt: null,
      arrivedDropoffAt: null,
      priceQuote: q.quote,
      declaredValueKurus: null,
      deliveryCodeRequired: false,
      deliveryCode: null,
      deliveryCodeFailedAttempts: 0,
      offerExpiresAt: null,
      offers: [],
      trackingToken: `demo${no}`.padEnd(32, "0"),
      cancelReason: status === "iptal" ? "Müşteri vazgeçti" : null,
      problemNote: null,
      paymentRef: null,
      paymentError: null,
      podPhotoPath: status === "teslim_edildi" ? "demo/foto.jpg" : null,
      podSignaturePath: null,
      podReceiverName: status === "teslim_edildi" ? "Resepsiyon" : null,
      history: reached.map((s, i) => ({
        fromStatus: i ? reached[i - 1]! : null,
        toStatus: s,
        at: new Date(new Date(createdAt).getTime() + i * 10 * 60_000).toISOString(),
        note: null,
      })),
    });
  }
  // Teslim edilemeyip göndericiye iade edilmiş örnek sipariş (en eski teslimlerden biri)
  const ret = orders.find((o) => o.status === "teslim_edildi" && !o.urgent && o.courierId === "kur-2");
  if (ret) {
    const at = ret.deliveredAt!;
    ret.status = "geri_teslim";
    ret.deliveredAt = null;
    ret.returnedAt = at;
    ret.failedAt = new Date(new Date(at).getTime() - 30 * 60_000).toISOString();
    ret.failedReason = "alici_yok";
    ret.failedNote = "Ofis kapalı, telefon cevap vermedi";
    ret.failedCallAttempts = 3;
    ret.failedPhotoPath = "demo/kapi.jpg";
    ret.returnPodPhotoPath = "demo/iade.jpg";
    ret.returnReceiverName = "Gönderen";
    ret.podPhotoPath = null;
    ret.podReceiverName = null;
    ret.priceQuote = applyFailedDeliveryReturn(ret.priceQuote, { roundTrip: ret.roundTrip }, DEFAULT_PRICING_SETTINGS);
    ret.subtotalKurus = ret.priceQuote.subtotalKurus;
    ret.totalKurus = ret.priceQuote.totalKurus;
    ret.history = [
      ...ret.history.filter((h) => h.toStatus !== "teslim_edildi"),
      { fromStatus: "yolda", toStatus: "geri_donuyor", at: ret.failedAt, note: "Teslim edilemedi: alici_yok — Ofis kapalı, telefon cevap vermedi" },
      { fromStatus: "geri_donuyor", toStatus: "geri_teslim", at, note: null },
    ];
  }
  // Varış kayıtları: teslim edilen siparişlerde alışa ve teslime varış, ölçülen bekleme
  for (const o of orders.filter((x) => x.status === "teslim_edildi")) {
    const at = (s: OrderStatus) => new Date(o.history.find((h) => h.toStatus === s)?.at ?? o.createdAt).getTime();
    // 15 dk altı: fiyata bekleme ücreti eklenmez (demo tutarları değişmesin)
    const wait = (o.orderNo.charCodeAt(o.orderNo.length - 1) * 7) % 15;
    o.arrivedPickupAt = new Date(at("alindi") - wait * 60_000).toISOString();
    o.arrivedDropoffAt = new Date(at("teslim_edildi") - 3 * 60_000).toISOString();
    o.waitingMinutes = wait;
    o.waitingSource = "olcum";
  }
  // Teklif geçmişi örneği: uzak kurye reddetti, yakındaki kabul etti
  for (const o of orders.filter((x) => x.status === "teslim_edildi" && x.courierId === "kur-1").slice(-2)) {
    const at = new Date(o.history.find((h) => h.toStatus === "kuryeye_atandi")?.at ?? o.createdAt).getTime();
    const iso = (ms: number) => new Date(at + ms).toISOString();
    o.offers = [
      { courierId: "kur-2", courierName: "Emre Şahin", offeredAt: iso(-90_000), expiresAt: iso(-30_000), respondedAt: iso(-75_000), response: "ret", reason: "Çok uzak" },
      { courierId: "kur-1", courierName: "Mehmet Kaya", offeredAt: iso(-60_000), expiresAt: iso(0), respondedAt: iso(-40_000), response: "kabul", reason: null },
    ];
  }
  // Kuryeye ödemeli teslimatlar: çoğu nakit tahsil edildi; biri IBAN bildirimi, biri tahsil edilemedi (alacak)
  orders
    .filter((o) => o.status === "teslim_edildi" && o.paymentMethod === "nakit")
    .forEach((o, i) => {
      o.cashCollection = i === 0 ? "iban" : i === 1 ? "alinmadi" : "nakit";
      if (o.cashCollection === "nakit") {
        o.paymentStatus = "odendi";
        o.paidKurus = o.totalKurus;
      }
    });
  // Hakedişler; Emre'nin 14 günden eski teslimatları geçmiş bir hesaplaşmayla ödenmiş
  const earnings = orders
    .filter((o) => o.status === "teslim_edildi" && o.courierId)
    .map((o) => earningFor(o, DEFAULT_COST_MODEL, DEFAULT_PRICING_SETTINGS));
  const paidUntil = hoursAgo(14 * 24);
  const old = earnings.filter((e) => e.courierId === "kur-2" && e.deliveredAt <= paidUntil);
  const payouts: CourierPayout[] = [];
  if (old.length) {
    const sum = (f: (e: EarningRow) => number) => old.reduce((a, e) => a + f(e), 0);
    payouts.push({
      id: "pay-1",
      courierId: "kur-2",
      courierName: "Emre Şahin",
      untilAt: paidUntil,
      deliveryCount: old.length,
      earningsKurus: sum((e) => e.totalKurus),
      cashKurus: sum((e) => e.cashCollectedKurus),
      netKurus: sum((e) => e.totalKurus - e.cashCollectedKurus),
      note: "Havale",
      createdAt: paidUntil,
      cancelledAt: null,
    });
    for (const e of old) e.payoutId = "pay-1";
  }
  const shifts: Shift[] = Array.from({ length: 10 }, (_, i) => {
    const c = couriers[i % 2]!;
    const start = new Date(Date.now() - (Math.floor(i / 2) + 1) * 86_400_000);
    start.setUTCHours(6, 0, 0, 0); // 09:00 İstanbul
    return {
      id: `sh-${i}`,
      courierId: c.id,
      courierName: c.fullName,
      courierPhone: c.phone,
      plate: c.plate,
      startedAt: start.toISOString(),
      endedAt: new Date(start.getTime() + (8 + (i % 3)) * 3_600_000).toISOString(),
      // Öğle molası 13:00 (İstanbul), 30–50 dk
      breaks: [{ startedAt: new Date(start.getTime() + 4 * 3_600_000).toISOString(), endedAt: new Date(start.getTime() + (4 * 60 + 30 + (i % 3) * 10) * 60_000).toISOString(), auto: false }],
    };
  });
  shifts.push({
    id: "sh-open",
    courierId: "kur-1",
    courierName: "Mehmet Kaya",
    courierPhone: "+905551110001",
    plate: "34 YZG 01",
    startedAt: hoursAgo(3),
    endedAt: null,
    breaks: [],
  });
  const incidents: Incident[] = [
    {
      id: "inc-open",
      courierId: "kur-1",
      courierName: "Mehmet Kaya",
      courierPhone: "+905551110001",
      kind: "arac_ariza",
      note: "Arka lastik patladı, Kavacık köprü girişi",
      lat: 41.0921,
      lng: 29.0905,
      accuracyM: 12,
      orderId: null,
      orderNo: null,
      createdAt: hoursAgo(0.04),
      alertCount: 1,
      acknowledgedAt: null,
      resolvedAt: null,
      resolutionNote: null,
    },
    {
      id: "inc-old",
      courierId: "kur-2",
      courierName: "Emre Şahin",
      courierPhone: "+905551110002",
      kind: "kaza",
      note: "Hafif sürtünme",
      lat: 41.02,
      lng: 29.03,
      accuracyM: 8,
      orderId: null,
      orderNo: null,
      createdAt: hoursAgo(120),
      alertCount: 1,
      acknowledgedAt: hoursAgo(119.95),
      resolvedAt: hoursAgo(119),
      resolutionNote: "Kurye arandı, yaralanma yok; iş yeniden atandı",
    },
  ];
  // Örnek yazışma: teklif geçmişi olan son teslimatta
  const chatOrder = orders.filter((o) => o.offers.length).at(-1);
  const messages: Array<OrderMessage & { orderId: string }> = chatOrder
    ? [
        { id: "msg-1", orderId: chatOrder.id, senderRole: "kurye", body: "Kapıdayım", createdAt: chatOrder.arrivedDropoffAt ?? chatOrder.createdAt, readAt: chatOrder.arrivedDropoffAt },
        { id: "msg-2", orderId: chatOrder.id, senderRole: "musteri", body: "Resepsiyona bırakabilirsiniz", createdAt: chatOrder.arrivedDropoffAt ?? chatOrder.createdAt, readAt: chatOrder.arrivedDropoffAt },
      ]
    : [];
  return {
    signedIn: false,
    incidents,
    messages,
    ops: {
      unpaidCardTimeoutMinutes: 30,
      autoApprove: true,
      autoAssign: true,
      maxActiveOrdersPerCourier: 3,
      maxPickupDistanceKm: 15,
      locationMaxAgeMinutes: 10,
      unassignedAlertMinutes: 10,
      enforceCourierDocuments: true,
      documentWarnDays: 30,
      urgentSlaMinutes: 60,
      referralRewardKurus: 10_000,
      winbackEnabled: false,
      winbackAfterDays: 30,
      winbackDiscountPct: 15,
      offerEnabled: true,
      offerTimeoutSeconds: 60,
      arrivalAutoRadiusM: 100,
      arrivalMaxRadiusM: 300,
      maxBreakMinutes: 45,
      offerAutoBreakAfter: 3,
      failedDeliveryMinWaitMinutes: 10,
    },
    consented: new Set(["cus-1", "cus-2", "cus-3"]),
    apiKeys: [],
    webhooks: new Map(),
    leads: [
      {
        id: "lead-1",
        kind: "kurumsal",
        companyName: "Kadıköy Mali Müşavirlik",
        contactName: "Selin Arslan",
        phone: "+902163334455",
        email: "selin@ornek-mm.com",
        monthlyVolume: "20-50",
        message: "Ayda 30 civarı vergi dairesi ve SGK evrakımız var.",
        sourcePage: "/kurumsal",
        status: "yeni",
        adminNote: null,
        createdAt: hoursAgo(2),
      },
      {
        id: "lead-2",
        kind: "iletisim",
        companyName: null,
        contactName: "Burak Çelik",
        phone: "+905301234567",
        email: null,
        monthlyVolume: null,
        message: "Hafta sonu çalışıyor musunuz?",
        sourcePage: "/iletisim",
        status: "arandi",
        adminNote: "Cumartesi de çalıştığımızı söyledim.",
        createdAt: hoursAgo(30),
      },
    ],
    applications: [
      {
        id: "app-1",
        fullName: "Okan Yıldız",
        phone: "+905441112233",
        email: null,
        district: "Ümraniye",
        birthYear: 1996,
        licenseClass: "A2",
        hasMotorcycle: true,
        plate: "34 OKN 34",
        vehicleModel: "Yamaha NMAX 125",
        experienceYears: 3,
        availability: "tam_zamanli",
        message: "Daha önce yemek kuryeliği yaptım.",
        documents: [
          { kind: "ehliyet_on", path: "app-1/ehliyet_on.jpg" },
          { kind: "ruhsat", path: "app-1/ruhsat.pdf" },
        ],
        status: "yeni",
        adminNote: null,
        courierId: null,
        createdAt: hoursAgo(5),
      },
      {
        id: "app-2",
        fullName: "Murat Ak",
        phone: "+905467778899",
        email: null,
        district: "Kartal",
        birthYear: 1990,
        licenseClass: "A",
        hasMotorcycle: false,
        plate: null,
        vehicleModel: null,
        experienceYears: 6,
        availability: "yari_zamanli",
        message: null,
        documents: [],
        status: "gorusme",
        adminNote: "Perşembe 14:00 görüşme",
        courierId: null,
        createdAt: hoursAgo(50),
      },
    ],
    settings: { ...DEFAULT_PRICING_SETTINGS },
    costModel: { ...DEFAULT_COST_MODEL },
    promos: [
      {
        code: "HOSGELDIN",
        description: "Yeni müşterilere ilk sipariş",
        kind: "yuzde",
        value: 20,
        maxDiscountKurus: 20_000,
        minSubtotalKurus: 0,
        validFrom: null,
        validUntil: null,
        maxRedemptions: null,
        perCustomerLimit: 1,
        newCustomersOnly: true,
        customerId: null,
        active: true,
        source: "panel",
        createdAt: hoursAgo(300),
        redemptions: 7,
        discountKurus: 98_000,
      },
    ],
    documents: demoDocuments(),
    earnings,
    payouts,
    holidays: (holidaysJson as Array<{ date: string; name: string; half_day: boolean }>).map((h) => ({
      date: h.date,
      name: h.name,
      halfDay: h.half_day,
    })),
    couriers,
    customers,
    corporate,
    orders,
    shifts,
    conversations: [
      {
        id: "conv-1",
        channel: "whatsapp",
        externalId: "905334445566",
        status: "handoff",
        handoffReason: "Paket hasarlı teslim edilmiş, müşteri iade istiyor",
        lastMessageAt: hoursAgo(0.3),
        transcript: [
          { role: "user", text: "Merhaba, dün gelen paketin köşesi ezilmiş." },
          { role: "assistant", text: "Çok üzgünüz. Durumu bir temsilcimize iletiyorum, en kısa sürede size dönecek." },
        ],
      },
      {
        id: "conv-2",
        channel: "whatsapp",
        externalId: "905321112233",
        status: "active",
        handoffReason: null,
        lastMessageAt: hoursAgo(1),
        transcript: [
          { role: "user", text: "Beykoz'dan Levent'e acil gönderi ne kadar?" },
          { role: "assistant", text: "Beykoz → Levent acil teslimat KDV dahil 1.146,00 TL. Sipariş oluşturalım mı?" },
        ],
      },
    ],
    invoices: orders
      .filter((o) => o.status === "teslim_edildi" && !o.corporateAccountId)
      .map(
        (o): Invoice => ({
          id: `inv-${o.id}`,
          kind: "order",
          orderId: o.id,
          orderNo: o.orderNo,
          corporateAccountId: null,
          period: null,
          status: "pending",
          attempts: 0,
          lastError: "Paraşüt yapılandırılmamış (demo)",
          buyerName: o.customerName ?? "Nihai Tüketici",
          description: `Kurye hizmeti ${o.orderNo}`,
          totalKurus: o.totalKurus,
          docType: null,
          pdfUrl: null,
          issuedAt: null,
          createdAt: o.deliveredAt ?? o.createdAt,
        }),
      ),
  };
}

export function createDemoRepo(): AdminRepo {
  let state: Promise<State> | null = null;
  const get = () => (state ??= seed());
  const authListeners = new Set<() => void>();
  const orderListeners = new Set<() => void>();
  const clone = <T,>(v: T): T => structuredClone(v);
  const touchOrders = () => orderListeners.forEach((l) => l());
  const refreshCounts = (s: State) => {
    for (const c of s.couriers) {
      c.activeOrderCount = s.orders.filter(
        (o) => o.courierId === c.id && ["kuryeye_atandi", "alindi", "yolda"].includes(o.status),
      ).length;
    }
  };

  function transition(o: AdminOrderDetail, to: OrderStatus, note: string | null = null) {
    if (!ORDER_TRANSITIONS[o.status].includes(to)) {
      throw new RepoError(`Geçersiz durum geçişi: ${o.status} → ${to}`);
    }
    o.history.push({ fromStatus: o.status, toStatus: to, at: new Date().toISOString(), note });
    // Bekleyen teklif: geri alınır ya da yöneticinin ilerletmesiyle kabul sayılır
    const open = o.offers.find((x) => !x.response);
    if (o.status === "kuryeye_atandi" && open) {
      open.respondedAt = new Date().toISOString();
      open.response = to === "onaylandi" || to === "iptal" ? "geri_alindi" : "kabul";
      o.offerExpiresAt = null;
    }
    o.status = to;
    if (to === "teslim_edildi") {
      o.deliveredAt = new Date().toISOString();
      if (o.slaDueAt) o.slaMissed = o.deliveredAt > o.slaDueAt;
    }
    if (to === "iptal") {
      o.cancelReason = note;
      if (o.paymentStatus === "odendi") o.paymentStatus = "iade_edildi";
    }
    if (to === "sorunlu") o.problemNote = note;
    if (to === "geri_teslim") o.returnedAt = new Date().toISOString();
  }

  return {
    mode: "demo",

    async signIn(email, password) {
      if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
        throw new RepoError(`Demo girişi: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
      }
      (await get()).signedIn = true;
      authListeners.forEach((l) => l());
    },
    async signOut() {
      (await get()).signedIn = false;
      authListeners.forEach((l) => l());
    },
    async currentAdmin() {
      return (await get()).signedIn ? { id: "demo-admin", fullName: "Yönetici (demo)" } : null;
    },
    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },

    async listOrders(filter = {}) {
      const s = await get();
      const search = filter.search?.toLocaleLowerCase("tr-TR");
      return clone(
        s.orders
          .filter((o) => !filter.statuses?.length || filter.statuses.includes(o.status))
          .filter((o) => !filter.from || o.createdAt >= istDayStartUtc(filter.from))
          .filter((o) => !filter.to || o.createdAt < istDayEndUtc(filter.to))
          .filter(
            (o) =>
              !search ||
              [o.orderNo, o.pickupAddress, o.dropoffAddress, o.customerName ?? ""].some((x) =>
                x.toLocaleLowerCase("tr-TR").includes(search),
              ),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, filter.limit ?? 500),
      ) as AdminOrder[];
    },
    async getOrder(id) {
      const o = (await get()).orders.find((x) => x.id === id);
      if (!o) throw new RepoError("Sipariş bulunamadı");
      return clone(o);
    },
    async assignCourier(orderId, courierId) {
      const s = await get();
      const o = s.orders.find((x) => x.id === orderId);
      const c = s.couriers.find((x) => x.id === courierId);
      if (!o || !c) throw new RepoError("Sipariş veya kurye bulunamadı");
      if (!c.active) throw new RepoError("Kurye pasif");
      if (o.status === "beklemede" || o.status === "kuryeye_atandi") transition(o, "onaylandi");
      o.courierId = c.id;
      o.courierName = c.fullName;
      transition(o, "kuryeye_atandi");
      refreshCounts(s);
      touchOrders();
    },
    async setStatus(orderId, status, note) {
      const s = await get();
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) throw new RepoError("Sipariş bulunamadı");
      transition(o, status, note ?? null);
      refreshCounts(s);
      touchOrders();
    },
    async reportFailedDelivery(orderId, reason, note) {
      const s = await get();
      const o = s.orders.find((x) => x.id === orderId);
      if (!o) throw new RepoError("Sipariş bulunamadı");
      transition(o, "geri_donuyor", `Teslim edilemedi: ${reason}${note.trim() ? ` — ${note.trim()}` : ""}`);
      o.failedAt = new Date().toISOString();
      o.failedReason = reason;
      o.failedNote = note.trim() || null;
      const extraBridgeCrossings = o.pickupSide === "avrupa" && o.dropoffSide === "anadolu" ? 1 : 0;
      o.priceQuote = applyFailedDeliveryReturn(o.priceQuote, { roundTrip: o.roundTrip, extraBridgeCrossings }, s.settings);
      o.subtotalKurus = o.priceQuote.subtotalKurus;
      o.totalKurus = o.priceQuote.totalKurus;
      touchOrders();
    },
    subscribeOrders(cb) {
      orderListeners.add(cb);
      return () => orderListeners.delete(cb);
    },
    async listOrderMessages(orderId) {
      return clone(
        (await get()).messages
          .filter((m) => m.orderId === orderId)
          .map((m) => ({ id: m.id, senderRole: m.senderRole, body: m.body, createdAt: m.createdAt, readAt: m.readAt })),
      );
    },
    async sendOrderMessage(orderId, body) {
      const text = body.trim();
      if (!text || text.length > 1000) throw new RepoError("Mesaj 1–1000 karakter olmalı");
      const s = await get();
      s.messages.push({ id: `msg-${s.messages.length + 1}`, orderId, senderRole: "admin", body: text, createdAt: new Date().toISOString(), readAt: null });
      touchOrders();
    },
    subscribeOrderMessages(_orderId, cb) {
      orderListeners.add(cb);
      return () => orderListeners.delete(cb);
    },
    async listIncidents({ openOnly, limit = 50 }) {
      return clone((await get()).incidents.filter((i) => !openOnly || !i.resolvedAt).slice(0, limit));
    },
    async acknowledgeIncident(id) {
      const i = (await get()).incidents.find((x) => x.id === id);
      if (i) i.acknowledgedAt ??= new Date().toISOString();
      touchOrders();
    },
    async resolveIncident(id, note) {
      if (!note.trim()) throw new RepoError("Kapatmak için ne yapıldığını yazın");
      const i = (await get()).incidents.find((x) => x.id === id && !x.resolvedAt);
      if (!i) throw new RepoError("Kayıt bulunamadı veya zaten kapalı");
      const now = new Date().toISOString();
      i.acknowledgedAt ??= now;
      i.resolvedAt = now;
      i.resolutionNote = note.trim();
      touchOrders();
    },
    subscribeIncidents(cb) {
      orderListeners.add(cb);
      return () => orderListeners.delete(cb);
    },
    async podUrl() {
      return null;
    },

    async listCouriers() {
      const s = await get();
      refreshCounts(s);
      return clone(s.couriers);
    },
    async createCourier(input) {
      const s = await get();
      if (!/^\+?[0-9 ]{10,16}$/.test(input.phone)) throw new RepoError("Telefon numarası geçersiz");
      s.couriers.push({
        id: `kur-${s.couriers.length + 1}`,
        fullName: input.fullName,
        phone: input.phone,
        plate: input.plate,
        vehicleModel: input.vehicleModel ?? null,
        active: true,
        isOnShift: false,
        onBreak: false,
        lastLat: null,
        lastLng: null,
        lastLocationAt: null,
        activeOrderCount: 0,
      });
      return { id: s.couriers[s.couriers.length - 1]!.id };
    },
    async updateCourier(id, patch) {
      const c = (await get()).couriers.find((x) => x.id === id);
      if (!c) throw new RepoError("Kurye bulunamadı");
      Object.assign(c, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    },
    async listShifts({ from, to, courierId }) {
      return clone(
        (await get()).shifts.filter(
          (x) =>
            x.startedAt >= istDayStartUtc(from) &&
            x.startedAt < istDayEndUtc(to) &&
            (!courierId || x.courierId === courierId),
        ),
      );
    },

    async listCustomers(search) {
      const q = search?.toLocaleLowerCase("tr-TR");
      return clone(
        (await get()).customers.filter(
          (c) => !q || [c.fullName, c.phone, c.email].some((x) => x?.toLocaleLowerCase("tr-TR").includes(q)),
        ),
      );
    },
    async setCustomerCorporate(profileId, corporateAccountId) {
      const c = (await get()).customers.find((x) => x.id === profileId);
      if (c) c.corporateAccountId = corporateAccountId;
    },
    async listCorporateAccounts() {
      return clone((await get()).corporate);
    },
    async saveCorporateAccount(acc) {
      const s = await get();
      if (acc.id) {
        const existing = s.corporate.find((x) => x.id === acc.id);
        if (!existing) throw new RepoError("Hesap bulunamadı");
        Object.assign(existing, acc);
        return clone(existing);
      }
      const created = { ...acc, id: `corp-${s.corporate.length + 1}` } as CorporateAccount;
      s.corporate.push(created);
      return clone(created);
    },
    async monthlyStatement(corporateAccountId, month) {
      const s = await get();
      const account = s.corporate.find((x) => x.id === corporateAccountId);
      if (!account) throw new RepoError("Hesap bulunamadı");
      const [start, end] = istMonthRangeUtc(month);
      const orders = s.orders.filter(
        (o) =>
          o.corporateAccountId === corporateAccountId &&
          o.status === "teslim_edildi" &&
          o.deliveredAt! >= start &&
          o.deliveredAt! < end,
      );
      return clone({
        account,
        month,
        orders,
        invoice: calculateMonthlyInvoice(
          orders.map((o) => monthlyInvoiceItem(o.subtotalKurus, o.priceQuote)),
          s.settings,
        ),
      });
    },

    async listInvoices() {
      return clone((await get()).invoices);
    },
    async createMonthlyInvoice(corporateAccountId, month) {
      const s = await get();
      if (s.invoices.some((i) => i.corporateAccountId === corporateAccountId && i.period === month)) {
        throw new RepoError("Bu ay için fatura zaten oluşturulmuş");
      }
      const st = await this.monthlyStatement(corporateAccountId, month);
      if (!st.orders.length) throw new RepoError("Bu ay teslim edilmiş sipariş yok");
      s.invoices.unshift({
        id: `inv-${corporateAccountId}-${month}`,
        kind: "monthly",
        orderId: null,
        orderNo: null,
        corporateAccountId,
        period: month,
        status: "pending",
        attempts: 0,
        lastError: null,
        buyerName: st.account.companyName,
        description: `${month} kurye hizmetleri (${st.invoice.deliveryCount} teslimat)`,
        totalKurus: st.invoice.totalKurus,
        docType: null,
        pdfUrl: null,
        issuedAt: null,
        createdAt: new Date().toISOString(),
      });
    },
    async retryInvoice(id) {
      const inv = (await get()).invoices.find((i) => i.id === id);
      if (inv) Object.assign(inv, { status: "pending", attempts: 0, lastError: null });
    },

    async getOpsSettings() {
      return clone((await get()).ops);
    },
    async saveOpsSettings(o) {
      (await get()).ops = clone(o);
    },
    async getSystemHealth() {
      const s = await get();
      const now = Date.now();
      const fresh = new Date(now - 60_000).toISOString();
      const waiting = s.orders.filter(
        (o) => (o.status === "beklemede" || o.status === "onaylandi") && now - new Date(o.createdAt).getTime() > 30 * 60_000,
      ).length;
      const onShift = s.couriers.filter((c) => c.isOnShift && c.active);
      const stale = onShift.filter((c) => !c.lastLocationAt || now - new Date(c.lastLocationAt).getTime() > 15 * 60_000).length;
      const failedInvoices = s.invoices.filter((i) => i.status === "failed").length;
      const issues: Awaited<ReturnType<AdminRepo["getSystemHealth"]>>["issues"] = [];
      if (waiting) issues.push({ key: "orders_waiting", severity: "critical", message: `${waiting} sipariş 30 dakikadan uzun süredir kurye bekliyor` });
      if (failedInvoices) issues.push({ key: "invoices_failed", severity: "warning", message: `${failedInvoices} fatura kesilemedi` });
      if (stale) issues.push({ key: "couriers_stale", severity: "warning", message: `Vardiyadaki ${stale} kuryenin konumu 15 dakikadır gelmiyor` });
      return {
        snapshot: {
          checked_at: new Date().toISOString(),
          orders_waiting: waiting,
          orders_problem: s.orders.filter((o) => o.status === "sorunlu").length,
          notifications_stuck: 0,
          invoices_failed: failedInvoices,
          webhooks_failed_24h: 0,
          couriers_on_shift: onShift.length,
          couriers_stale: stale,
          heartbeats: { "notify-dispatch": fresh, "auto-dispatch": fresh, "webhook-dispatch": fresh, "invoice-dispatch": fresh, health: fresh },
        },
        issues,
      };
    },
    async getReadiness() {
      // Demo: Supabase bağlı değil, tüm dış servisler sahte sağlayıcıyla çalışır
      const s = await get();
      const items: ReadinessItem[] = [
        { key: "supabase", group: "Servisler", label: "Supabase (veritabanı)", status: "eksik", detail: "DEMO modu: veriler tarayıcıda, kalıcı değil", doc: "§1" },
        { key: "maps", group: "Servisler", label: "Google Maps (adres ve rota)", status: "eksik", detail: "Sahte harita: örnek adresler ve kuş uçuşu mesafe", doc: "§3" },
        { key: "sms", group: "Servisler", label: "SMS (Netgsm)", status: "eksik", detail: "SMS gönderilmiyor (deneme modu)", doc: "§4" },
        { key: "whatsapp", group: "Servisler", label: "WhatsApp Business", status: "uyari", detail: "WhatsApp kapalı, SMS'e düşer", doc: "§8" },
        { key: "payment", group: "Servisler", label: "Kartla ödeme (iyzico)", status: "uyari", detail: "Test ortamı (sandbox): gerçek para çekilmez", doc: "§9" },
        { key: "invoice", group: "Servisler", label: "e-Arşiv / e-Fatura (Paraşüt)", status: "eksik", detail: "Faturalar kesilmiyor (sahte entegratör)", doc: "§10" },
        { key: "job:notify-dispatch", group: "Zamanlanmış görevler", label: "notify-dispatch", status: "ok", detail: "Çalışıyor", doc: "§6" },
        { key: "job:courier-earnings", group: "Zamanlanmış görevler", label: "courier-earnings", status: "eksik", detail: "Hiç çalışmadı: cron kaydını ekleyin", doc: "§6" },
        { key: "cost", group: "Ayarlar", label: "Kurye ödeme modeli", status: "uyari", detail: "Varsayılan öneri değerler kullanılıyor; kuryelerle anlaştığınız rakamları girin (Fiyatlar)", doc: "§23" },
        {
          key: "couriers",
          group: "Operasyon",
          label: "Belgeleri tam aktif kurye",
          status: "ok",
          detail: `${s.couriers.filter((c) => c.active).length} aktif kurye`,
          doc: "§24",
        },
      ];
      return { items, ready: !items.some((i) => i.status === "eksik") };
    },
    async runDispatch() {
      const s = await get();
      let approved = 0;
      if (s.ops.autoApprove) {
        for (const o of s.orders) {
          if (o.status === "beklemede" && (o.paymentMethod !== "kart" || o.paymentStatus === "odendi")) {
            transition(o, "onaylandi", "Otomatik onay");
            approved++;
          }
        }
      }
      if (!s.ops.autoAssign) return { approved, assigned: [], unassigned: [] };
      refreshCounts(s);
      const pending = s.orders.filter((o) => o.status === "onaylandi" && (o.paymentMethod !== "kart" || o.paymentStatus === "odendi"));
      const plan = planAssignments(
        pending.map((o) => ({
          id: o.id,
          pickupLat: o.pickupLat,
          pickupLng: o.pickupLng,
          urgent: o.urgent,
          serviceLevel: o.serviceLevel,
          createdAt: o.createdAt,
          scheduledPickupAt: o.scheduledPickupAt,
          declinedBy: [],
        })),
        s.couriers
          .filter((c) => c.active && c.isOnShift && !c.onBreak)
          .filter((c) => !s.ops.enforceCourierDocuments || courierCompliance(s.documents.filter((d) => d.courierId === c.id)).ok)
          .map((c) => ({ id: c.id, name: c.fullName, lat: c.lastLat, lng: c.lastLng, locationAt: c.lastLocationAt, activeOrders: c.activeOrderCount })),
        {
          maxActiveOrdersPerCourier: s.ops.maxActiveOrdersPerCourier,
          maxPickupDistanceKm: s.ops.maxPickupDistanceKm,
          locationMaxAgeMinutes: s.ops.locationMaxAgeMinutes,
          now: new Date(),
        },
      );
      for (const a of plan.assignments) {
        const o = s.orders.find((x) => x.id === a.orderId)!;
        const c = s.couriers.find((x) => x.id === a.courierId)!;
        o.courierId = c.id;
        o.courierName = c.fullName;
        transition(o, "kuryeye_atandi", `Otomatik atama (${a.distanceKm.toLocaleString("tr-TR")} km)`);
        if (s.ops.offerEnabled) {
          const offeredAt = new Date();
          o.offerExpiresAt = new Date(offeredAt.getTime() + s.ops.offerTimeoutSeconds * 1000).toISOString();
          o.offers.push({ courierId: c.id, courierName: c.fullName, offeredAt: offeredAt.toISOString(), expiresAt: o.offerExpiresAt, respondedAt: null, response: null, reason: null });
          // Demo: kurye birkaç saniye içinde kabul eder
          setTimeout(() => {
            const open = o.offers.find((x) => !x.response && x.courierId === c.id);
            if (!open || o.status !== "kuryeye_atandi") return;
            open.respondedAt = new Date().toISOString();
            open.response = "kabul";
            o.offerExpiresAt = null;
            touchOrders();
          }, 4000);
        }
      }
      refreshCounts(s);
      touchOrders();
      return { approved, assigned: plan.assignments, unassigned: plan.unassigned };
    },

    async searchPlaces(input) {
      return mockMapsProvider().autocomplete(input);
    },
    async placeDetails(placeId) {
      return mockMapsProvider().placeDetails(placeId);
    },
    async quote(order) {
      const s = await get();
      try {
        return await buildQuote(parseOrderRequest(order), { maps: mockMapsProvider(), settings: s.settings, holidays: s.holidays });
      } catch (e) {
        if (e instanceof ValidationError) throw new RepoError(e.message);
        throw e;
      }
    },
    async lookupPhoneCustomer(phone) {
      const s = await get();
      const key = phoneDigits(phone);
      const c = s.customers.find((x) => x.phone && phoneDigits(x.phone) === key);
      if (!c) return null;
      const seen = new Set<string>();
      const recent: PhoneCustomer["recentAddresses"] = [];
      for (const o of s.orders.filter((x) => x.customerId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
        for (const side of ["pickup", "dropoff"] as const) {
          const address = side === "pickup" ? o.pickupAddress : o.dropoffAddress;
          if (seen.has(address)) continue;
          seen.add(address);
          const p = MOCK_PLACES.find((m) => m.address === address);
          if (!p) continue;
          recent.push({
            address,
            details: side === "pickup" ? o.pickupDetails : o.dropoffDetails,
            lat: p.lat,
            lng: p.lng,
            contactName: side === "pickup" ? o.pickupContactName : o.dropoffContactName,
            contactPhone: side === "pickup" ? o.pickupContactPhone : o.dropoffContactPhone,
          });
        }
      }
      return {
        id: c.id,
        fullName: c.fullName,
        email: c.email,
        corporateAccountId: c.corporateAccountId,
        hasConsent: s.consented.has(c.id),
        recentAddresses: recent.slice(0, 6),
      };
    },
    async createPhoneOrder({ phone, fullName, verbalConsent, order }) {
      const s = await get();
      const key = phoneDigits(phone);
      if (!/^5\d{9}$/.test(key)) throw new RepoError("Geçerli bir cep telefonu numarası girin");
      if (order.paymentMethod === "kart") throw new RepoError("Telefon siparişinde ödeme kuryeye veya cari hesaba yapılır");
      let c = s.customers.find((x) => x.phone && phoneDigits(x.phone) === key);
      if (!c) {
        c = { id: `cus-${s.customers.length + 1}`, fullName: fullName || null, phone: `+90${key}`, email: null, corporateAccountId: null, createdAt: new Date().toISOString(), orderCount: 0 };
        s.customers.push(c);
      }
      if (!s.consented.has(c.id)) {
        if (!verbalConsent) throw new RepoError("Müşteriden KVKK onayı alınmalı (aydınlatma metnini okuyup sözlü onayını işaretleyin)");
        s.consented.add(c.id);
      }
      if (order.paymentMethod === "cari" && !c.corporateAccountId) throw new RepoError("Cari hesap ile ödeme yalnızca kurumsal müşteriler içindir");
      const req = parseOrderRequest(order);
      const q = await buildQuote(req, { maps: mockMapsProvider(), settings: s.settings, holidays: s.holidays });
      const n = 1000 + s.orders.length + 1;
      const now = new Date().toISOString();
      const o: AdminOrderDetail = {
        id: `ord-${n}`,
        orderNo: `YK-${n}`,
        status: "beklemede",
        createdAt: now,
        urgent: req.urgent,
        serviceLevel: req.serviceLevel,
        roundTrip: req.roundTrip,
        pickupAddress: req.pickup.address,
        pickupSide: q.pickupSide,
        pickupLat: req.pickup.lat,
        pickupLng: req.pickup.lng,
        dropoffLat: req.dropoff.lat,
        dropoffLng: req.dropoff.lng,
        dropoffAddress: req.dropoff.address,
        dropoffSide: q.dropoffSide,
        customerId: c.id,
        customerName: c.fullName,
        customerPhone: c.phone,
        corporateAccountId: c.corporateAccountId,
        courierId: null,
        courierName: null,
        totalKurus: q.quote.totalKurus,
        subtotalKurus: q.quote.subtotalKurus,
        paymentMethod: req.paymentMethod,
        paymentStatus: req.paymentMethod === "cari" ? "cari_hesap" : "odenmedi",
        paidKurus: null,
        cashCollection: null,
        ...demoSla(req.serviceLevel === "acil", now, null),
        distanceMeters: q.distanceMeters,
        scheduledPickupAt: req.scheduledPickupAt,
        deliveredAt: null,
        failedReason: null,
        returnedAt: null,
        failedAt: null,
        failedNote: null,
        failedCallAttempts: null,
        failedPhotoPath: null,
        returnPodPhotoPath: null,
        returnPodSignaturePath: null,
        returnReceiverName: null,
        pickupDetails: req.pickup.details ?? null,
        pickupContactName: req.pickup.contactName ?? null,
        pickupContactPhone: req.pickup.contactPhone ?? null,
        dropoffDetails: req.dropoff.details ?? null,
        dropoffContactName: req.dropoff.contactName ?? null,
        dropoffContactPhone: req.dropoff.contactPhone ?? null,
        packageDescription: req.packageDescription ?? null,
        weightKg: req.weightKg,
        customerNote: req.customerNote ?? null,
        waitingMinutes: 0,
        waitingSource: null,
        arrivedPickupAt: null,
        arrivedDropoffAt: null,
        priceQuote: q.quote,
        declaredValueKurus: req.declaredValueKurus,
        deliveryCodeRequired: req.deliveryCode,
        deliveryCode: req.deliveryCode ? String(1000 + Math.floor(Math.random() * 9000)) : null,
        deliveryCodeFailedAttempts: 0,
        offerExpiresAt: null,
        offers: [],
        trackingToken: `demo${n}`.padEnd(32, "0"),
        cancelReason: status === "iptal" ? "Müşteri vazgeçti" : null,
        problemNote: null,
        paymentRef: null,
        paymentError: null,
        podPhotoPath: null,
        podSignaturePath: null,
        podReceiverName: null,
        history: [{ fromStatus: null, toStatus: "beklemede", at: now, note: "Telefon siparişi" }],
      };
      s.orders.push(o);
      c.orderCount++;
      touchOrders();
      return { id: o.id, orderNo: o.orderNo };
    },

    async listRatings({ from, to }) {
      const s = await get();
      // Demo: teslim edilen siparişlere sabit örnek puanlar (çoğu 5, birkaç düşük)
      const SCORES = [5, 5, 4, 5, 5, 3, 5, 4, 5, 5, 2, 5, 4, 5];
      const COMMENTS: Record<number, string> = { 2: "Kurye geç geldi, haber vermedi.", 3: "Paket biraz ezilmişti." };
      return s.orders
        .filter((o) => o.status === "teslim_edildi" && o.deliveredAt)
        .filter((o) => o.deliveredAt! >= istDayStartUtc(from) && o.deliveredAt! < istDayEndUtc(to))
        .map((o, i): OrderRating | null => {
          if (i % 3 === 2) return null; // herkes puan vermez
          const score = SCORES[i % SCORES.length]!;
          return {
            orderId: o.id,
            orderNo: o.orderNo,
            score,
            comment: COMMENTS[score] ?? null,
            courierId: o.courierId,
            courierName: o.courierName,
            customerName: o.customerName,
            createdAt: new Date(new Date(o.deliveredAt!).getTime() + 20 * 60_000).toISOString(),
          };
        })
        .filter((r): r is OrderRating => r !== null);
    },
    async listApiKeys(accountId) {
      return clone((await get()).apiKeys.filter((k) => k.accountId === accountId));
    },
    async createApiKey(accountId, profileId, name) {
      const s = await get();
      const owner = s.customers.find((c) => c.id === profileId);
      if (!owner || owner.corporateAccountId !== accountId) throw new RepoError("Anahtar kullanıcısı bu kurumsal hesaba bağlı değil");
      const key = generateApiKey();
      s.apiKeys.unshift({
        id: `key-${s.apiKeys.length + 1}`,
        accountId,
        name: name.trim() || "API",
        prefix: keyPrefix(key),
        profileId,
        profileName: owner.fullName,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        revokedAt: null,
      });
      return { key };
    },
    async revokeApiKey(id) {
      const k = (await get()).apiKeys.find((x) => x.id === id);
      if (k) k.revokedAt = new Date().toISOString();
    },
    async getWebhook(accountId) {
      const w = (await get()).webhooks.get(accountId);
      return w ? { ...w } : null;
    },
    async saveWebhook(accountId, cfg) {
      if (!/^https:\/\/\S+$/.test(cfg.url)) throw new RepoError("Webhook adresi https:// ile başlamalı");
      (await get()).webhooks.set(accountId, { ...cfg });
    },
    async listWebhookDeliveries() {
      return [];
    },
    async listLeads() {
      return clone((await get()).leads);
    },
    async updateLead(id, patch) {
      const l = (await get()).leads.find((x) => x.id === id);
      if (!l) throw new RepoError("Başvuru bulunamadı");
      if (patch.status) l.status = patch.status;
      if (patch.adminNote !== undefined) l.adminNote = patch.adminNote;
    },
    async listCourierApplications() {
      return clone((await get()).applications);
    },
    async updateCourierApplication(id, patch) {
      const a = (await get()).applications.find((x) => x.id === id);
      if (!a) throw new RepoError("Başvuru bulunamadı");
      if (patch.status) a.status = patch.status;
      if (patch.adminNote !== undefined) a.adminNote = patch.adminNote;
    },
    async approveCourierApplication(id, input) {
      const a = (await get()).applications.find((x) => x.id === id);
      if (!a) throw new RepoError("Başvuru bulunamadı");
      if (!input.plate.trim()) throw new RepoError("Plaka zorunlu");
      const { id: courierId } = await this.createCourier({ fullName: a.fullName, phone: a.phone, plate: input.plate, vehicleModel: input.vehicleModel });
      a.status = "onaylandi";
      a.courierId = courierId;
      a.plate = input.plate;
      return { courierId };
    },
    async listCourierDocuments(courierId) {
      return clone((await get()).documents.filter((d) => !courierId || d.courierId === courierId));
    },
    async saveCourierDocument(doc, file) {
      const s = await get();
      const prev = s.documents.find((d) => d.courierId === doc.courierId && d.kind === doc.kind);
      const next: CourierDocumentRecord = {
        ...doc,
        filePath: file ? `${doc.courierId}/${doc.kind}-${Date.now()}-${file.name}` : (prev?.filePath ?? null),
        updatedAt: new Date().toISOString(),
      };
      s.documents = [...s.documents.filter((d) => d !== prev), next];
    },
    async deleteCourierDocument(courierId, kind) {
      const s = await get();
      s.documents = s.documents.filter((d) => !(d.courierId === courierId && d.kind === kind));
    },
    async courierDocumentUrl(path) {
      return this.applicationDocumentUrl(path);
    },
    async applicationDocumentUrl(path) {
      // Demo: gerçek dosya yok, yer tutucu görsel
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="100%" height="100%" fill="#e7eef6"/><text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#0f3d6e">Demo belge: ${path}</text></svg>`;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    },
    async listConversations() {
      return clone((await get()).conversations);
    },
    async closeConversation(id) {
      const c = (await get()).conversations.find((x) => x.id === id);
      if (c) c.status = "closed";
    },

    async getCostModel() {
      return clone((await get()).costModel);
    },
    async saveCostModel(m) {
      (await get()).costModel = clone(m);
    },
    async runCourierEarnings() {
      const s = await get();
      const done = new Set(s.earnings.map((e) => e.orderId));
      const fresh = s.orders
        .filter((o) => o.status === "teslim_edildi" && o.courierId && !done.has(o.id))
        .map((o) => earningFor(o, s.costModel, s.settings));
      s.earnings.unshift(...fresh);
      return { written: fresh.length };
    },
    async listEarnings({ unpaidOnly, courierId, payoutId }) {
      const s = await get();
      return clone(
        s.earnings
          .filter((e) => (!unpaidOnly || !e.payoutId) && (!courierId || e.courierId === courierId) && (!payoutId || e.payoutId === payoutId))
          .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt)),
      );
    },
    async listPayouts() {
      return clone((await get()).payouts);
    },
    async createPayout(courierId, note) {
      const s = await get();
      const now = new Date().toISOString();
      const rows = s.earnings.filter((e) => e.courierId === courierId && !e.payoutId && e.deliveredAt <= now);
      if (!rows.length) throw new RepoError("Hesaplaşılacak teslimat yok");
      const sum = (f: (e: EarningRow) => number) => rows.reduce((a, e) => a + f(e), 0);
      const p: CourierPayout = {
        id: `pay-${s.payouts.length + 1}-${Date.now()}`,
        courierId,
        courierName: s.couriers.find((c) => c.id === courierId)?.fullName ?? null,
        untilAt: now,
        deliveryCount: rows.length,
        earningsKurus: sum((e) => e.totalKurus),
        cashKurus: sum((e) => e.cashCollectedKurus),
        netKurus: sum((e) => e.totalKurus - e.cashCollectedKurus),
        note: note?.trim() || null,
        createdAt: now,
        cancelledAt: null,
      };
      for (const e of rows) e.payoutId = p.id;
      s.payouts.unshift(p);
      return clone(p);
    },
    async cancelPayout(id) {
      const s = await get();
      const p = s.payouts.find((x) => x.id === id && !x.cancelledAt);
      if (!p) throw new RepoError("Hesaplaşma bulunamadı veya zaten iptal");
      p.cancelledAt = new Date().toISOString();
      for (const e of s.earnings) if (e.payoutId === id) e.payoutId = null;
    },
    async listReceivables() {
      const s = await get();
      return s.orders
        .filter((o) => o.paymentMethod === "nakit" && o.status === "teslim_edildi" && o.paymentStatus !== "odendi")
        .map((o) => ({
          orderId: o.id,
          orderNo: o.orderNo,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          courierName: o.courierName,
          deliveredAt: o.deliveredAt,
          totalKurus: o.totalKurus,
          cashCollection: o.cashCollection,
        }));
    },
    async markOrderPaid(orderId) {
      const o = (await get()).orders.find((x) => x.id === orderId);
      if (!o) throw new RepoError("Sipariş bulunamadı");
      o.paymentStatus = "odendi";
      o.paidKurus = o.totalKurus;
      touchOrders();
    },

    async listPromoCodes() {
      return clone((await get()).promos);
    },
    async createPromoCode(p) {
      const s = await get();
      if (s.promos.some((x) => x.code === p.code)) throw new RepoError("Bu kod zaten var");
      s.promos.unshift({ ...p, active: true, customerId: null, source: "panel", createdAt: new Date().toISOString(), redemptions: 0, discountKurus: 0 });
    },
    async setPromoActive(code, active) {
      const p = (await get()).promos.find((x) => x.code === code);
      if (p) p.active = active;
    },

    async getPricing() {
      const s = await get();
      return { settings: clone(s.settings), holidays: clone(s.holidays), updatedAt: null };
    },
    async savePricing(settings) {
      (await get()).settings = clone(settings);
    },
    async addHoliday(h) {
      const s = await get();
      s.holidays = [...s.holidays.filter((x) => x.date !== h.date), h].sort((a, b) => a.date.localeCompare(b.date));
    },
    async deleteHoliday(date) {
      const s = await get();
      s.holidays = s.holidays.filter((x) => x.date !== date);
    },
  };
}
