"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  calculateMonthlyInvoice,
  costModelFromRow,
  costModelToRow,
  monthlyInvoiceItem,
  holidayFromRow,
  pricingSettingsFromRow,
  pricingSettingsToRow,
  type OrderStatus,
  type PlaceDetails,
  type PlaceSuggestion,
} from "@yazgan/shared";
import { istDayEndUtc, istDayStartUtc, istMonthRangeUtc } from "../dates";
import {
  RepoError,
  type AdminOrder,
  type AdminOrderDetail,
  type AdminRepo,
  type CorporateAccount,
  type AdminQuote,
  type DispatchResult,
  type Conversation,
  type Courier,
  type CourierApplication,
  type CourierDocumentRecord,
  type CourierPayout,
  type EarningRow,
  type PromoCodeRow,
  type Invoice,
  type Receivable,
  type Lead,
  type PhoneCustomer,
  type ApiKeyInfo,
  type OrderRating,
  type Readiness,
  type SystemHealth,
  type WebhookDelivery,
} from "./types";
import { toTranscript } from "./transcript";
import { generateApiKey, keyPrefix, sha256Hex } from "../api-keys";

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
  serviceLevel: r.service_level ?? (r.urgent ? "acil" : "standart"),
  roundTrip: r.round_trip,
  pickupAddress: r.pickup_address,
  pickupSide: r.pickup_side,
  pickupLat: r.pickup_lat,
  pickupLng: r.pickup_lng,
  dropoffAddress: r.dropoff_address,
  dropoffLat: r.dropoff_lat,
  dropoffLng: r.dropoff_lng,
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
  cashCollection: r.cash_collection ?? null,
  slaDueAt: r.sla_due_at ?? null,
  slaMissed: r.sla_missed ?? null,
  offerExpiresAt: r.status === "kuryeye_atandi" && r.offer_expires_at && !r.offer_accepted_at ? r.offer_expires_at : null,
  distanceMeters: r.distance_meters,
  scheduledPickupAt: r.scheduled_pickup_at,
  deliveredAt: r.delivered_at,
});

const toEarning = (r: Row): EarningRow => ({
  orderId: r.order_id,
  orderNo: r.order?.order_no ?? "",
  courierId: r.courier_id,
  courierName: r.courier?.profile?.full_name ?? null,
  deliveredAt: r.delivered_at,
  km: Number(r.km),
  jobKurus: r.job_kurus,
  kmKurus: r.km_kurus,
  bonusKurus: r.bonus_kurus,
  waitingKurus: r.waiting_kurus,
  bridgeKurus: r.bridge_kurus,
  totalKurus: r.total_kurus,
  cashCollectedKurus: r.cash_collected_kurus,
  payoutId: r.payout_id,
});

const toPayout = (r: Row): CourierPayout => ({
  id: r.id,
  courierId: r.courier_id,
  courierName: r.courier?.profile?.full_name ?? null,
  untilAt: r.until_at,
  deliveryCount: r.delivery_count,
  earningsKurus: r.earnings_kurus,
  cashKurus: r.cash_kurus,
  netKurus: r.net_kurus,
  note: r.note,
  createdAt: r.created_at,
  cancelledAt: r.cancelled_at,
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

  async function invoke<T>(name: string, body: object): Promise<T> {
    const { data, error } = await client.functions.invoke(name, { body: body as Record<string, unknown> });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const payload = ctx ? await ctx.json().catch(() => ({})) : {};
      throw new RepoError(payload.error ?? "İşlem başarısız");
    }
    return data as T;
  }

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
      const limit = filter.limit ?? 500;
      const PAGE = 1000; // PostgREST tek istekte en fazla 1000 satır döndürür
      const rows: Row[] = [];
      for (let offset = 0; offset < limit; offset += PAGE) {
        let q = client
          .from("orders")
          .select(ORDER_SELECT)
          .order("created_at", { ascending: false })
          .order("id")
          .range(offset, Math.min(offset + PAGE, limit) - 1);
        if (filter.statuses?.length) q = q.in("status", filter.statuses);
        if (filter.from) q = q.gte("created_at", istDayStartUtc(filter.from));
        if (filter.to) q = q.lt("created_at", istDayEndUtc(filter.to));
        if (filter.search) {
          const s = filter.search.replace(/[%,()]/g, " ").trim();
          q = q.or(`order_no.ilike.%${s}%,pickup_address.ilike.%${s}%,dropoff_address.ilike.%${s}%`);
        }
        const page = (check(await q, "Siparişler okunamadı") ?? []) as Row[];
        rows.push(...page);
        if (page.length < Math.min(PAGE, limit - offset)) break;
      }
      return rows.map(toAdminOrder);
    },
    async getOrder(id) {
      const [o, h, of] = await Promise.all([
        client.from("orders").select(`${ORDER_SELECT}, secret:order_secrets(delivery_code, failed_attempts)`).eq("id", id).single(),
        client.from("order_status_history").select("*").eq("order_id", id).order("created_at"),
        client.from("courier_offers").select("*, courier:couriers(profile:profiles(full_name))").eq("order_id", id).order("offered_at"),
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
        declaredValueKurus: r.declared_value_kurus ?? null,
        deliveryCodeRequired: !!r.delivery_code_required,
        deliveryCode: (Array.isArray(r.secret) ? r.secret[0] : r.secret)?.delivery_code ?? null,
        deliveryCodeFailedAttempts: (Array.isArray(r.secret) ? r.secret[0] : r.secret)?.failed_attempts ?? 0,
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
        offers: (check(of, "Teklifler okunamadı") ?? []).map((x: Row) => ({
          courierId: x.courier_id,
          courierName: x.courier?.profile?.full_name ?? null,
          offeredAt: x.offered_at,
          expiresAt: x.expires_at,
          respondedAt: x.responded_at,
          response: x.response,
          reason: x.reason,
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new RepoError(data.error ?? "Kurye eklenemedi");
      return { id: data.id as string };
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
    async listCourierDocuments(courierId) {
      let q = client.from("courier_documents").select("*");
      if (courierId) q = q.eq("courier_id", courierId);
      return (check(await q, "Belgeler okunamadı") ?? []).map(
        (r: Row): CourierDocumentRecord => ({
          courierId: r.courier_id,
          kind: r.kind,
          docNumber: r.doc_number,
          expiresAt: r.expires_at,
          filePath: r.file_path,
          note: r.note,
          updatedAt: r.updated_at,
        }),
      );
    },
    async saveCourierDocument(doc, file) {
      let filePath: string | undefined;
      if (file) {
        const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
        filePath = `${doc.courierId}/${doc.kind}-${Date.now()}.${ext}`;
        const up = await client.storage.from("courier-docs").upload(filePath, file, { contentType: file.type || undefined });
        if (up.error) throw new RepoError(`Dosya yüklenemedi: ${up.error.message}`);
      }
      const { data } = await client.auth.getSession();
      check(
        await client.from("courier_documents").upsert(
          {
            courier_id: doc.courierId,
            kind: doc.kind,
            doc_number: doc.docNumber,
            expires_at: doc.expiresAt,
            note: doc.note,
            updated_by: data.session?.user.id,
            ...(filePath ? { file_path: filePath } : {}),
          },
          { onConflict: "courier_id,kind" },
        ),
        "Belge kaydedilemedi",
      );
    },
    async deleteCourierDocument(courierId, kind) {
      check(await client.from("courier_documents").delete().eq("courier_id", courierId).eq("kind", kind), "Belge silinemedi");
    },
    async courierDocumentUrl(path) {
      const { data } = await client.storage.from("courier-docs").createSignedUrl(path, 300);
      return data?.signedUrl ?? null;
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
      const rows = check(o, "Siparişler okunamadı") ?? [];
      const orders = rows.map(toAdminOrder);
      const settings = pricingSettingsFromRow(check(s, "Fiyat ayarı okunamadı"));
      return {
        account: toCorporate(check(acc, "Hesap okunamadı")),
        month,
        orders,
        invoice: calculateMonthlyInvoice(
          rows.map((r: Row) => monthlyInvoiceItem(r.subtotal_kurus, r.price_quote)),
          settings,
        ),
      };
    },

    async listInvoices() {
      const res = await client
        .from("invoices")
        .select("*, order:orders(order_no)")
        .order("created_at", { ascending: false })
        .limit(300);
      return (check(res, "Faturalar okunamadı") ?? []).map(
        (r: Row): Invoice => ({
          id: r.id,
          kind: r.kind,
          orderId: r.order_id,
          orderNo: r.order?.order_no ?? null,
          corporateAccountId: r.corporate_account_id,
          period: r.period,
          status: r.status,
          attempts: r.attempts,
          lastError: r.last_error,
          buyerName: r.buyer?.name ?? "",
          description: r.description,
          totalKurus: r.total_kurus,
          docType: r.provider_doc_type,
          pdfUrl: r.pdf_url,
          issuedAt: r.issued_at,
          createdAt: r.created_at,
        }),
      );
    },
    async createMonthlyInvoice(corporateAccountId, month) {
      const { error } = await client.functions.invoke("invoice-monthly", { body: { corporateAccountId, month } });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const payload = ctx ? await ctx.json().catch(() => ({})) : {};
        throw new RepoError(payload.error ?? "Fatura oluşturulamadı");
      }
    },
    async retryInvoice(id) {
      check(
        await client.from("invoices").update({ status: "pending", attempts: 0, last_error: null }).eq("id", id),
        "Fatura yeniden kuyruğa alınamadı",
      );
    },

    async getOpsSettings() {
      const r = check(await client.from("ops_settings").select("*").eq("id", 1).single(), "Ayarlar okunamadı") as Row;
      return {
        unpaidCardTimeoutMinutes: r.unpaid_card_timeout_minutes,
        autoApprove: r.auto_approve,
        autoAssign: r.auto_assign,
        maxActiveOrdersPerCourier: r.max_active_orders_per_courier,
        maxPickupDistanceKm: Number(r.max_pickup_distance_km),
        locationMaxAgeMinutes: r.location_max_age_minutes,
        unassignedAlertMinutes: r.unassigned_alert_minutes,
        enforceCourierDocuments: r.enforce_courier_documents ?? true,
        documentWarnDays: r.document_warn_days ?? 30,
        urgentSlaMinutes: r.urgent_sla_minutes ?? 60,
        referralRewardKurus: r.referral_reward_kurus ?? 10_000,
        winbackEnabled: !!r.winback_enabled,
        winbackAfterDays: r.winback_after_days ?? 30,
        winbackDiscountPct: Number(r.winback_discount_pct ?? 15),
        offerEnabled: r.offer_enabled ?? true,
        offerTimeoutSeconds: r.offer_timeout_seconds ?? 60,
      };
    },
    async saveOpsSettings(s) {
      check(
        await client
          .from("ops_settings")
          .update({
            unpaid_card_timeout_minutes: s.unpaidCardTimeoutMinutes,
            auto_approve: s.autoApprove,
            auto_assign: s.autoAssign,
            max_active_orders_per_courier: s.maxActiveOrdersPerCourier,
            max_pickup_distance_km: s.maxPickupDistanceKm,
            location_max_age_minutes: s.locationMaxAgeMinutes,
            unassigned_alert_minutes: s.unassignedAlertMinutes,
            enforce_courier_documents: s.enforceCourierDocuments,
            document_warn_days: s.documentWarnDays,
            urgent_sla_minutes: s.urgentSlaMinutes,
            referral_reward_kurus: s.referralRewardKurus,
            winback_enabled: s.winbackEnabled,
            winback_after_days: s.winbackAfterDays,
            winback_discount_pct: s.winbackDiscountPct,
            offer_enabled: s.offerEnabled,
            offer_timeout_seconds: s.offerTimeoutSeconds,
          })
          .eq("id", 1),
        "Ayarlar kaydedilemedi",
      );
    },
    runDispatch: () => invoke<DispatchResult>("auto-dispatch", {}),
    getSystemHealth: () => invoke<SystemHealth>("health", {}),
    getReadiness: () => invoke<Readiness>("readiness", {}),

    async searchPlaces(input, sessionToken) {
      return (await invoke<{ suggestions: PlaceSuggestion[] }>("places", { input, sessionToken })).suggestions;
    },
    async placeDetails(placeId, sessionToken) {
      return (await invoke<{ place: PlaceDetails }>("places", { placeId, sessionToken })).place;
    },
    quote: (order) => invoke<AdminQuote>("quote", order),
    async lookupPhoneCustomer(phone) {
      return (await invoke<{ customer: PhoneCustomer | null }>("admin-order", { action: "lookup", phone })).customer;
    },
    async createPhoneOrder(input) {
      const r = await invoke<{ order: { id: string; order_no: string } }>("admin-order", { action: "create", ...input });
      return { id: r.order.id, orderNo: r.order.order_no };
    },

    async listRatings({ from, to }) {
      const rows =
        check(
          await client
            .from("order_ratings")
            .select("*, order:orders(order_no, courier_id, courier:couriers(profile:profiles(full_name)), customer:profiles!orders_customer_id_fkey(full_name))")
            .gte("created_at", istDayStartUtc(from))
            .lt("created_at", istDayEndUtc(to))
            .order("created_at", { ascending: false })
            .limit(2000),
          "Değerlendirmeler okunamadı",
        ) ?? [];
      return rows.map(
        (r: Row): OrderRating => ({
          orderId: r.order_id,
          orderNo: r.order?.order_no ?? "",
          score: r.score,
          comment: r.comment,
          courierId: r.order?.courier_id ?? null,
          courierName: r.order?.courier?.profile?.full_name ?? null,
          customerName: r.order?.customer?.full_name ?? null,
          createdAt: r.created_at,
        }),
      );
    },

    // ───────── Kurumsal API
    async listApiKeys(accountId) {
      const rows =
        check(
          await client.from("api_keys").select("*, profile:profiles(full_name)").eq("corporate_account_id", accountId).order("created_at", { ascending: false }),
          "API anahtarları okunamadı",
        ) ?? [];
      return rows.map(
        (r: Row): ApiKeyInfo => ({
          id: r.id,
          name: r.name,
          prefix: r.key_prefix,
          profileId: r.profile_id,
          profileName: r.profile?.full_name ?? null,
          createdAt: r.created_at,
          lastUsedAt: r.last_used_at,
          revokedAt: r.revoked_at,
        }),
      );
    },
    async createApiKey(accountId, profileId, name) {
      const key = generateApiKey();
      check(
        await client.from("api_keys").insert({
          corporate_account_id: accountId,
          profile_id: profileId,
          name: name.trim() || "API",
          key_prefix: keyPrefix(key),
          key_hash: await sha256Hex(key),
        }),
        "API anahtarı oluşturulamadı",
      );
      return { key };
    },
    async revokeApiKey(id) {
      check(await client.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id), "Anahtar iptal edilemedi");
    },
    async getWebhook(accountId) {
      const { data } = await client.from("corporate_webhooks").select("url, secret, active").eq("corporate_account_id", accountId).maybeSingle();
      return data ? { url: data.url, secret: data.secret, active: data.active } : null;
    },
    async saveWebhook(accountId, cfg) {
      if (!/^https:\/\/\S+$/.test(cfg.url)) throw new RepoError("Webhook adresi https:// ile başlamalı");
      check(
        await client.from("corporate_webhooks").upsert({ corporate_account_id: accountId, url: cfg.url, secret: cfg.secret, active: cfg.active }),
        "Webhook kaydedilemedi",
      );
    },
    async listWebhookDeliveries(accountId) {
      const rows =
        check(
          await client
            .from("webhook_deliveries")
            .select("*, order:orders(order_no)")
            .eq("corporate_account_id", accountId)
            .order("created_at", { ascending: false })
            .limit(30),
          "Webhook kayıtları okunamadı",
        ) ?? [];
      return rows.map(
        (r: Row): WebhookDelivery => ({
          id: r.id,
          event: r.event,
          status: r.status,
          attempts: r.attempts,
          lastError: r.last_error,
          responseStatus: r.response_status,
          orderNo: r.order?.order_no ?? null,
          createdAt: r.created_at,
          deliveredAt: r.delivered_at,
        }),
      );
    },

    // ───────── Başvurular
    async listLeads() {
      const rows = check(await client.from("leads").select("*").order("created_at", { ascending: false }).limit(300), "Başvurular okunamadı") ?? [];
      return rows.map(
        (r: Row): Lead => ({
          id: r.id,
          kind: r.kind,
          companyName: r.company_name,
          contactName: r.contact_name,
          phone: r.phone,
          email: r.email,
          monthlyVolume: r.monthly_volume,
          message: r.message,
          sourcePage: r.source_page,
          status: r.status,
          adminNote: r.admin_note,
          createdAt: r.created_at,
        }),
      );
    },
    async updateLead(id, patch) {
      check(await client.from("leads").update({ status: patch.status, admin_note: patch.adminNote }).eq("id", id), "Başvuru güncellenemedi");
    },
    async listCourierApplications() {
      const rows =
        check(await client.from("courier_applications").select("*").order("created_at", { ascending: false }).limit(300), "Kurye başvuruları okunamadı") ?? [];
      return rows.map(
        (r: Row): CourierApplication => ({
          id: r.id,
          fullName: r.full_name,
          phone: r.phone,
          email: r.email,
          district: r.district,
          birthYear: r.birth_year,
          licenseClass: r.license_class,
          hasMotorcycle: r.has_motorcycle,
          plate: r.plate,
          vehicleModel: r.vehicle_model,
          experienceYears: r.experience_years,
          availability: r.availability,
          message: r.message,
          documents: r.documents ?? [],
          status: r.status,
          adminNote: r.admin_note,
          courierId: r.courier_id,
          createdAt: r.created_at,
        }),
      );
    },
    async updateCourierApplication(id, patch) {
      check(
        await client.from("courier_applications").update({ status: patch.status, admin_note: patch.adminNote }).eq("id", id),
        "Başvuru güncellenemedi",
      );
    },
    async approveCourierApplication(id, input) {
      const { data: a } = await client.from("courier_applications").select("full_name, phone").eq("id", id).single();
      if (!a) throw new RepoError("Başvuru bulunamadı");
      const { id: courierId } = await this.createCourier({ fullName: a.full_name, phone: a.phone, plate: input.plate, vehicleModel: input.vehicleModel });
      check(
        await client.from("courier_applications").update({ status: "onaylandi", courier_id: courierId, plate: input.plate }).eq("id", id),
        "Başvuru güncellenemedi",
      );
      return { courierId };
    },
    async applicationDocumentUrl(path) {
      const { data } = await client.storage.from("basvuru").createSignedUrl(path, 600);
      return data?.signedUrl ?? null;
    },

    async listConversations() {
      const res = await client
        .from("assistant_conversations")
        .select("id, channel, external_id, status, handoff_reason, last_message_at, messages")
        .order("last_message_at", { ascending: false })
        .limit(100);
      return (check(res, "Konuşmalar okunamadı") ?? []).map(
        (r: Row): Conversation => ({
          id: r.id,
          channel: r.channel,
          externalId: r.external_id,
          status: r.status,
          handoffReason: r.handoff_reason,
          lastMessageAt: r.last_message_at,
          transcript: toTranscript(r.messages ?? []),
        }),
      );
    },
    async closeConversation(id) {
      check(await client.from("assistant_conversations").update({ status: "closed" }).eq("id", id), "Kapatılamadı");
    },

    async getCostModel() {
      return costModelFromRow(check(await client.from("cost_settings").select("*").eq("id", 1).single(), "Maliyet modeli okunamadı")!);
    },
    async saveCostModel(m) {
      const { data } = await client.auth.getSession();
      check(
        await client.from("cost_settings").update({ ...costModelToRow(m), updated_by: data.session?.user.id }).eq("id", 1),
        "Maliyet modeli kaydedilemedi",
      );
    },
    async runCourierEarnings() {
      return invoke<{ written: number }>("courier-earnings", {});
    },
    async listEarnings({ unpaidOnly, courierId, payoutId }) {
      let q = client
        .from("courier_earnings")
        .select("*, order:orders(order_no), courier:couriers(profile:profiles(full_name))")
        .order("delivered_at", { ascending: false })
        .limit(5000);
      if (unpaidOnly) q = q.is("payout_id", null);
      if (courierId) q = q.eq("courier_id", courierId);
      if (payoutId) q = q.eq("payout_id", payoutId);
      return (check(await q, "Hakedişler okunamadı") ?? []).map(toEarning);
    },
    async listPayouts() {
      const res = await client
        .from("courier_payouts")
        .select("*, courier:couriers(profile:profiles(full_name))")
        .order("created_at", { ascending: false })
        .limit(200);
      return (check(res, "Hesaplaşmalar okunamadı") ?? []).map(toPayout);
    },
    async createPayout(courierId, note) {
      const { data, error } = await client.rpc("create_courier_payout", { p_courier_id: courierId, p_note: note ?? null });
      if (error) throw new RepoError(error.message);
      return toPayout(data as Row);
    },
    async cancelPayout(id) {
      const { error } = await client.rpc("cancel_courier_payout", { p_payout_id: id });
      if (error) throw new RepoError(error.message);
    },
    async listReceivables() {
      const res = await client
        .from("orders")
        .select(ORDER_SELECT)
        .eq("payment_method", "nakit")
        .eq("status", "teslim_edildi")
        .neq("payment_status", "odendi")
        .order("delivered_at", { ascending: false })
        .limit(500);
      return (check(res, "Tahsilatlar okunamadı") ?? []).map((r: Row): Receivable => {
        const o = toAdminOrder(r);
        return {
          orderId: o.id,
          orderNo: o.orderNo,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          courierName: o.courierName,
          deliveredAt: o.deliveredAt,
          totalKurus: o.totalKurus,
          cashCollection: o.cashCollection,
        };
      });
    },
    async markOrderPaid(orderId) {
      const res = await client.from("orders").select("total_kurus").eq("id", orderId).single();
      const total = check(res, "Sipariş okunamadı")!.total_kurus;
      check(
        await client
          .from("orders")
          .update({ payment_status: "odendi", paid_kurus: total, paid_at: new Date().toISOString() })
          .eq("id", orderId),
        "Ödeme kaydedilemedi",
      );
    },

    async listPromoCodes() {
      const [p, r] = await Promise.all([
        client.from("promo_codes").select("*").order("created_at", { ascending: false }).limit(500),
        client.from("promo_redemptions").select("code, amount_kurus").limit(20_000),
      ]);
      const uses = new Map<string, { n: number; sum: number }>();
      for (const x of check(r, "Kullanımlar okunamadı") ?? []) {
        const u = uses.get(x.code) ?? { n: 0, sum: 0 };
        u.n++;
        u.sum += x.amount_kurus;
        uses.set(x.code, u);
      }
      return (check(p, "Kampanyalar okunamadı") ?? []).map((row: Row): PromoCodeRow => ({
        code: row.code,
        description: row.description,
        kind: row.kind,
        value: Number(row.value),
        maxDiscountKurus: row.max_discount_kurus,
        minSubtotalKurus: row.min_subtotal_kurus,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        maxRedemptions: row.max_redemptions,
        perCustomerLimit: row.per_customer_limit,
        newCustomersOnly: row.new_customers_only,
        customerId: row.customer_id,
        active: row.active,
        source: row.source,
        createdAt: row.created_at,
        redemptions: uses.get(row.code)?.n ?? 0,
        discountKurus: uses.get(row.code)?.sum ?? 0,
      }));
    },
    async createPromoCode(p) {
      check(
        await client.from("promo_codes").insert({
          code: p.code,
          description: p.description,
          kind: p.kind,
          value: p.value,
          max_discount_kurus: p.maxDiscountKurus,
          min_subtotal_kurus: p.minSubtotalKurus,
          valid_from: p.validFrom,
          valid_until: p.validUntil,
          max_redemptions: p.maxRedemptions,
          per_customer_limit: p.perCustomerLimit,
          new_customers_only: p.newCustomersOnly,
        }),
        "Kampanya kaydedilemedi",
      );
    },
    async setPromoActive(code, active) {
      check(await client.from("promo_codes").update({ active }).eq("code", code), "Kampanya güncellenemedi");
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
