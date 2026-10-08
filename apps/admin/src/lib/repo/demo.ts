"use client";

/**
 * DEMO veri kaynağı: Supabase bağlanmadan paneli denemek için.
 * Giriş: admin@yazgankurye.com / demo1234. Veriler tarayıcı belleğinde tutulur.
 */
import {
  DEFAULT_PRICING_SETTINGS,
  ORDER_TRANSITIONS,
  buildQuote,
  calculateMonthlyInvoice,
  mockMapsProvider,
  MOCK_PLACES,
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
  type Customer,
  type Invoice,
  type Shift,
} from "./types";

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
  invoices: Invoice[];
}

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
    { id: "cus-2", fullName: "Av. Murat Demir", phone: "+905334445566", email: "murat@ornek-hukuk.com", corporateAccountId: "corp-1", createdAt: hoursAgo(900), orderCount: 0 },
  ];
  const couriers: Courier[] = [
    { id: "kur-1", fullName: "Mehmet Kaya", phone: "+905551110001", plate: "34 YZG 01", vehicleModel: "Honda PCX 125", active: true, isOnShift: true, lastLat: 41.08, lastLng: 29.06, lastLocationAt: hoursAgo(0.05), activeOrderCount: 0 },
    { id: "kur-2", fullName: "Emre Şahin", phone: "+905551110002", plate: "34 YZG 02", vehicleModel: "Yamaha NMAX", active: true, isOnShift: false, lastLat: null, lastLng: null, lastLocationAt: null, activeOrderCount: 0 },
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
  const orders: AdminOrderDetail[] = [];
  let no = 1000;
  for (const [customerId, from, to, status, ago, urgent, courierId] of specs) {
    const p = place(from);
    const d = place(to);
    const createdAt = hoursAgo(ago);
    const q = await buildQuote(
      {
        pickup: p,
        dropoff: d,
        urgent,
        roundTrip: false,
        weightKg: null,
        largePackage: false,
        scheduledPickupAt: null,
        paymentMethod: customerId === "cus-2" ? "cari" : "nakit",
      },
      { maps, settings: DEFAULT_PRICING_SETTINGS, holidays: [], now: new Date(createdAt) },
    );
    const cust = customers.find((c) => c.id === customerId)!;
    cust.orderCount++;
    const flow: OrderStatus[] = ["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda", "teslim_edildi"];
    const reached = flow.slice(0, flow.indexOf(status) + 1);
    orders.push({
      id: `ord-${++no}`,
      orderNo: `YK-${no}`,
      status,
      createdAt,
      urgent,
      roundTrip: false,
      pickupAddress: p.address,
      pickupSide: p.side,
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
      distanceMeters: q.distanceMeters,
      scheduledPickupAt: null,
      deliveredAt: status === "teslim_edildi" ? hoursAgo(ago - 1) : null,
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
      priceQuote: q.quote,
      trackingToken: `demo${no}`.padEnd(32, "0"),
      cancelReason: null,
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
  });
  return {
    signedIn: false,
    settings: { ...DEFAULT_PRICING_SETTINGS },
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
    o.status = to;
    if (to === "teslim_edildi") o.deliveredAt = new Date().toISOString();
    if (to === "iptal") {
      o.cancelReason = note;
      if (o.paymentStatus === "odendi") o.paymentStatus = "iade_edildi";
    }
    if (to === "sorunlu") o.problemNote = note;
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
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
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
    subscribeOrders(cb) {
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
        lastLat: null,
        lastLng: null,
        lastLocationAt: null,
        activeOrderCount: 0,
      });
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
          orders.map((o) => o.subtotalKurus),
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
