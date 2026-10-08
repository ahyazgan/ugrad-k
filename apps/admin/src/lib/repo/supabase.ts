"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  calculateMonthlyInvoice,
  holidayFromRow,
  pricingSettingsFromRow,
  pricingSettingsToRow,
  type OrderStatus,
} from "@yazgan/shared";
import { istDayEndUtc, istDayStartUtc, istMonthRangeUtc } from "../dates";
import {
  RepoError,
  type AdminOrder,
  type AdminOrderDetail,
  type AdminRepo,
  type CorporateAccount,
  type Courier,
} from "./types";

// Supabase'den gelen tipsiz satırlar (şema tipi üretilene kadar)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const ORDER_SELECT =
  "*, customer:profiles!orders_customer_id_fkey(full_name, phone), courier:couriers(profile:profiles(full_name))";

export const toAdminOrder = (r: Row): AdminOrder => ({
  id: r.id,
  orderNo: r.order_no,
  status: r.status,
  createdAt: r.created_at,
  urgent: r.urgent,
  roundTrip: r.round_trip,
  pickupAddress: r.pickup_address,
  pickupSide: r.pickup_side,
  dropoffAddress: r.dropoff_address,
  dropoffSide: r.dropoff_side,
  customerId: r.customer_id,
  customerName: r.customer?.full_name ?? null,
  customerPhone: r.customer?.phone ?? null,
  corporateAccountId: r.corporate_account_id,
  courierId: r.courier_id,
  courierName: r.courier?.profile?.full_name ?? null,
  totalKurus: r.total_kurus,
  subtotalKurus: r.subtotal_kurus,
  paymentMethod: r.payment_method,
  paymentStatus: r.payment_status,
  paidKurus: r.paid_kurus ?? null,
  distanceMeters: r.distance_meters,
  scheduledPickupAt: r.scheduled_pickup_at,
  deliveredAt: r.delivered_at,
});

const toCorporate = (r: Row): CorporateAccount => ({
  id: r.id,
  companyName: r.company_name,
  taxOffice: r.tax_office,
  taxNumber: r.tax_number,
  billingAddress: r.billing_address,
  billingEmail: r.billing_email,
  notes: r.notes,
});

function check<T>(res: { data: T; error: { message: string } | null }, msg: string): T {
  if (res.error) throw new RepoError(`${msg}: ${res.error.message}`);
  return res.data;
}

export function createSupabaseRepo(url: string, anonKey: string): AdminRepo & { client: SupabaseClient } {
  const client = createClient(url, anonKey);

  async function accessToken() {
    const { data } = await client.auth.getSession();
    if (!data.session) throw new RepoError("Oturum bulunamadı");
    return data.session.access_token;
  }

  return {
    mode: "supabase",
    client,

    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new RepoError("E-posta veya şifre hatalı");
      const me = await this.currentAdmin();
      if (!me) {
        await client.auth.signOut();
        throw new RepoError("Bu hesabın yönetici yetkisi yok");
      }
    },
    async signOut() {
      await client.auth.signOut();
    },
    async currentAdmin() {
      const { data } = await client.auth.getSession();
      const id = data.session?.user.id;
      if (!id) return null;
      const { data: p } = await client.from("profiles").select("id, role, full_name").eq("id", id).single();
      return p?.role === "admin" ? { id: p.id, fullName: p.full_name } : null;
    },
    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange(() => cb());
      return () => data.subscription.unsubscribe();
    },

    async listOrders(filter = {}) {
      let q = client.from("orders").select(ORDER_SELECT).order("created_at", { ascending: false }).limit(500);
      if (filter.statuses?.length) q = q.in("status", filter.statuses);
      if (filter.from) q = q.gte("created_at", istDayStartUtc(filter.from));
      if (filter.to) q = q.lt("created_at", istDayEndUtc(filter.to));
      if (filter.search) {
        const s = filter.search.replace(/[%,()]/g, " ").trim();
        q = q.or(`order_no.ilike.%${s}%,pickup_address.ilike.%${s}%,dropoff_address.ilike.%${s}%`);
      }
      return (check(await q, "Siparişler okunamadı") ?? []).map(toAdminOrder);
    },
    async getOrder(id) {
      const [o, h] = await Promise.all([
        client.from("orders").select(ORDER_SELECT).eq("id", id).single(),
        client.from("order_status_history").select("*").eq("order_id", id).order("created_at"),
      ]);
      const r = check(o, "Sipariş okunamadı") as Row;
      return {
        ...toAdminOrder(r),
        pickupDetails: r.pickup_details,
        pickupContactName: r.pickup_contact_name,
        pickupContactPhone: r.pickup_contact_phone,
        dropoffDetails: r.dropoff_details,
        dropoffContactName: r.dropoff_contact_name,
        dropoffContactPhone: r.dropoff_contact_phone,
        packageDescription: r.package_description,
        weightKg: r.weight_kg == null ? null : Number(r.weight_kg),
        customerNote: r.customer_note,
        waitingMinutes: r.waiting_minutes,
        priceQuote: r.price_quote,
        trackingToken: r.tracking_token,
        cancelReason: r.cancel_reason,
        problemNote: r.problem_note,
        paymentRef: r.payment_ref,
        paymentError: r.payment_error,
        podPhotoPath: r.pod_photo_path,
        podSignaturePath: r.pod_signature_path,
        podReceiverName: r.pod_receiver_name,
        history: (check(h, "Geçmiş okunamadı") ?? []).map((x: Row) => ({
          fromStatus: x.from_status,
          toStatus: x.to_status,
          at: x.created_at,
          note: x.note,
        })),
      } satisfies AdminOrderDetail;
    },
    async assignCourier(orderId, courierId) {
      check(await client.rpc("assign_courier", { p_order_id: orderId, p_courier_id: courierId }), "Atama yapılamadı");
    },
    async setStatus(orderId, status: OrderStatus, note) {
      check(
        await client.rpc("set_order_status", { p_order_id: orderId, p_status: status, p_note: note ?? null }),
        "Durum değiştirilemedi",
      );
      // İptalde kartla alınmış ödeme iyzico'dan iptal edilir (başarısızsa "iade_bekliyor" olur)
      if (status === "iptal") await client.functions.invoke("payment-refund", { body: { orderId } });
    },
    subscribeOrders(onChange) {
      const ch = client
        .channel("admin-orders")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, onChange)
        .subscribe();
      return () => {
        client.removeChannel(ch);
      };
    },
    async podUrl(path) {
      const { data } = await client.storage.from("pod").createSignedUrl(path, 600);
      return data?.signedUrl ?? null;
    },

    async listCouriers() {
      const [c, o] = await Promise.all([
        client.from("couriers").select("*, profile:profiles(full_name, phone)").order("created_at"),
        client.from("orders").select("courier_id").in("status", ["kuryeye_atandi", "alindi", "yolda"]),
      ]);
      const active = new Map<string, number>();
      for (const r of check(o, "Siparişler okunamadı") ?? []) active.set(r.courier_id, (active.get(r.courier_id) ?? 0) + 1);
      return (check(c, "Kuryeler okunamadı") ?? []).map(
        (r: Row): Courier => ({
          id: r.id,
          fullName: r.profile?.full_name ?? null,
          phone: r.profile?.phone ?? null,
          plate: r.plate,
          vehicleModel: r.vehicle_model,
          active: r.active,
          isOnShift: r.is_on_shift,
          lastLat: r.last_lat,
          lastLng: r.last_lng,
          lastLocationAt: r.last_location_at,
          activeOrderCount: active.get(r.id) ?? 0,
        }),
      );
    },
    async createCourier(input) {
      // Kullanıcı oluşturma service role gerektirir → sunucu tarafı route handler
      const res = await fetch("/api/kuryeler", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken()}` },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new RepoError((await res.json().catch(() => ({}))).error ?? "Kurye eklenemedi");
    },
    async updateCourier(id, patch) {
      check(
        await client
          .from("couriers")
          .update({ active: patch.active, plate: patch.plate, vehicle_model: patch.vehicleModel })
          .eq("id", id),
        "Kurye güncellenemedi",
      );
    },
    async listShifts({ from, to, courierId }) {
      let q = client
        .from("courier_shifts")
        .select("*, courier:couriers(plate, profile:profiles(full_name, phone))")
        .gte("started_at", istDayStartUtc(from))
        .lt("started_at", istDayEndUtc(to))
        .order("started_at");
      if (courierId) q = q.eq("courier_id", courierId);
      return (check(await q, "Vardiyalar okunamadı") ?? []).map((r: Row) => ({
        id: r.id,
        courierId: r.courier_id,
        courierName: r.courier?.profile?.full_name ?? null,
        courierPhone: r.courier?.profile?.phone ?? null,
        plate: r.courier?.plate ?? null,
        startedAt: r.started_at,
        endedAt: r.ended_at,
      }));
    },

    async listCustomers(search) {
      let q = client
        .from("profiles")
        .select("id, full_name, phone, email, corporate_account_id, created_at, orders:orders!orders_customer_id_fkey(count)")
        .eq("role", "musteri")
        .order("created_at", { ascending: false })
        .limit(500);
      if (search) {
        const s = search.replace(/[%,()]/g, " ").trim();
        q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
      }
      return (check(await q, "Müşteriler okunamadı") ?? []).map((r: Row) => ({
        id: r.id,
        fullName: r.full_name,
        phone: r.phone,
        email: r.email,
        corporateAccountId: r.corporate_account_id,
        createdAt: r.created_at,
        orderCount: r.orders?.[0]?.count ?? 0,
      }));
    },
    async setCustomerCorporate(profileId, corporateAccountId) {
      check(
        await client.from("profiles").update({ corporate_account_id: corporateAccountId }).eq("id", profileId),
        "Müşteri güncellenemedi",
      );
    },
    async listCorporateAccounts() {
      return (check(await client.from("corporate_accounts").select("*").order("company_name"), "Okunamadı") ?? []).map(toCorporate);
    },
    async saveCorporateAccount(acc) {
      const row = {
        company_name: acc.companyName,
        tax_office: acc.taxOffice,
        tax_number: acc.taxNumber,
        billing_address: acc.billingAddress,
        billing_email: acc.billingEmail,
        notes: acc.notes,
      };
      const res = acc.id
        ? await client.from("corporate_accounts").update(row).eq("id", acc.id).select("*").single()
        : await client.from("corporate_accounts").insert(row).select("*").single();
      return toCorporate(check(res, "Kurumsal hesap kaydedilemedi"));
    },
    async monthlyStatement(corporateAccountId, month) {
      const [start, end] = istMonthRangeUtc(month);
      const [acc, o, s] = await Promise.all([
        client.from("corporate_accounts").select("*").eq("id", corporateAccountId).single(),
        client
          .from("orders")
          .select(ORDER_SELECT)
          .eq("corporate_account_id", corporateAccountId)
          .eq("status", "teslim_edildi")
          .gte("delivered_at", start)
          .lt("delivered_at", end)
          .order("delivered_at"),
        client.from("pricing_settings").select("*").eq("id", 1).single(),
      ]);
      const orders = (check(o, "Siparişler okunamadı") ?? []).map(toAdminOrder);
      const settings = pricingSettingsFromRow(check(s, "Fiyat ayarı okunamadı"));
      return {
        account: toCorporate(check(acc, "Hesap okunamadı")),
        month,
        orders,
        invoice: calculateMonthlyInvoice(orders.map((x) => x.subtotalKurus), settings),
      };
    },

    async getPricing() {
      const [s, h] = await Promise.all([
        client.from("pricing_settings").select("*").eq("id", 1).single(),
        client.from("holidays").select("*").order("date"),
      ]);
      const row = check(s, "Fiyat ayarları okunamadı");
      return {
        settings: pricingSettingsFromRow(row),
        holidays: (check(h, "Tatiller okunamadı") ?? []).map(holidayFromRow),
        updatedAt: row.updated_at ?? null,
      };
    },
    async savePricing(settings) {
      const { data } = await client.auth.getSession();
      check(
        await client
          .from("pricing_settings")
          .update({ ...pricingSettingsToRow(settings), updated_by: data.session?.user.id })
          .eq("id", 1),
        "Fiyat ayarları kaydedilemedi",
      );
    },
    async addHoliday(h) {
      check(await client.from("holidays").upsert({ date: h.date, name: h.name, half_day: h.halfDay }), "Tatil eklenemedi");
    },
    async deleteHoliday(date) {
      check(await client.from("holidays").delete().eq("date", date), "Tatil silinemedi");
    },
  };
}
