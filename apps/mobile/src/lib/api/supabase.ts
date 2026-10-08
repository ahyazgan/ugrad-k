import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import { courierBalance, type OrderStatus } from "@yazgan/shared";
import { Platform } from "react-native";
import {
  ApiError,
  type Api,
  type ConsentType,
  type OrderDetail,
  type OrderSummary,
  type Profile,
  type QuoteResponse,
  type Session,
  type Shift,
} from "./types";

/** "0532 123 45 67" → "+905321234567" */
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^(90|0)/, "");
  if (!/^5\d{9}$/.test(digits)) throw new ApiError("Geçerli bir cep telefonu numarası girin", "phone");
  return `+90${digits}`;
}

type Row = Record<string, any>;

const LOCATION_POLL_MS = 30_000;

const toProfile = (r: Row): Profile => ({
  id: r.id,
  role: r.role,
  fullName: r.full_name,
  phone: r.phone,
  email: r.email,
  corporateAccountId: r.corporate_account_id,
});

const toSummary = (r: Row): OrderSummary => ({
  id: r.id,
  orderNo: r.order_no,
  status: r.status,
  pickupAddress: r.pickup_address,
  dropoffAddress: r.dropoff_address,
  totalKurus: r.total_kurus,
  urgent: r.urgent,
  createdAt: r.created_at,
  offerExpiresAt: r.offer_expires_at && !r.offer_accepted_at && r.status === "kuryeye_atandi" ? r.offer_expires_at : null,
  ...(r.pickup_lat != null ? { pickupPoint: { lat: r.pickup_lat, lng: r.pickup_lng } } : {}),
  ...(r.dropoff_lat != null ? { dropoffPoint: { lat: r.dropoff_lat, lng: r.dropoff_lng } } : {}),
  slaDueAt: r.sla_due_at ?? null,
});

export function createSupabaseApi(url: string, anonKey: string): Api & { client: SupabaseClient } {
  const client = createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === "web",
    },
  });

  const uid = async () => {
    const { data } = await client.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new ApiError("Oturum bulunamadı, lütfen tekrar giriş yapın", undefined, 401);
    return id;
  };

  /** Teslim kanıtı / adres fotoğrafını özel "pod" deposuna yükler */
  async function uploadPod(orderId: string, name: string, uri: string) {
    const path = `${orderId}/${name}`;
    const body = await (await fetch(uri)).arrayBuffer();
    const { error } = await client.storage.from("pod").upload(path, body, { contentType: "image/jpeg" });
    if (error) throw new ApiError(`Fotoğraf yüklenemedi: ${error.message}`);
    return path;
  }

  async function invoke<T>(name: string, body: object): Promise<T> {
    const { data, error } = await client.functions.invoke(name, { body: body as Record<string, unknown> });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const payload = await error.context.json().catch(() => ({}));
        throw new ApiError(payload.error ?? "İşlem başarısız", payload.field, error.context.status);
      }
      throw new ApiError("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
    }
    return data as T;
  }

  const fail = (e: { message: string } | null, msg: string) => {
    if (e) throw new ApiError(`${msg}: ${e.message}`);
  };

  return {
    mode: "supabase",
    client,

    async getSession() {
      const { data } = await client.auth.getSession();
      const u = data.session?.user;
      return u ? { userId: u.id, phone: u.phone ?? null } : null;
    },
    onSessionChange(cb) {
      const { data } = client.auth.onAuthStateChange((_e, s) =>
        cb(s?.user ? { userId: s.user.id, phone: s.user.phone ?? null } : null),
      );
      return () => data.subscription.unsubscribe();
    },
    async sendOtp(phone) {
      const { error } = await client.auth.signInWithOtp({ phone: toE164(phone) });
      if (error) throw new ApiError("Kod gönderilemedi, lütfen biraz sonra tekrar deneyin");
    },
    async verifyOtp(phone, code) {
      const { data, error } = await client.auth.verifyOtp({ phone: toE164(phone), token: code, type: "sms" });
      if (error || !data.user) throw new ApiError("Kod hatalı veya süresi dolmuş", "code");
      return { userId: data.user.id, phone: data.user.phone ?? null } satisfies Session;
    },
    async signOut() {
      await client.auth.signOut();
    },
    async deleteAccount() {
      await invoke("account-delete", {});
      await client.auth.signOut();
    },

    async getProfile() {
      const { data, error } = await client.from("profiles").select("*").eq("id", await uid()).single();
      fail(error, "Profil okunamadı");
      return toProfile(data!);
    },
    async updateProfile(patch) {
      const { data, error } = await client
        .from("profiles")
        .update({ full_name: patch.fullName, email: patch.email })
        .eq("id", await uid())
        .select("*")
        .single();
      fail(error, "Profil kaydedilemedi");
      return toProfile(data!);
    },
    async savePushToken(token) {
      const { error } = await client.from("profiles").update({ push_token: token }).eq("id", await uid());
      fail(error, "Bildirim kaydı yapılamadı");
    },
    async getConsents() {
      const { data, error } = await client.from("current_consents").select("consent_type, granted");
      fail(error, "Rıza bilgisi okunamadı");
      return Object.fromEntries((data ?? []).map((c) => [c.consent_type, c.granted])) as Partial<
        Record<ConsentType, boolean>
      >;
    },
    async saveConsents(items, version) {
      const profileId = await uid();
      const { error } = await client.from("consents").insert(
        items.map((i) => ({
          profile_id: profileId,
          consent_type: i.type,
          granted: i.granted,
          version,
          user_agent: `${Platform.OS} ${Platform.Version}`,
        })),
      );
      fail(error, "Onay kaydedilemedi");
    },

    async searchPlaces(input, sessionToken) {
      return (await invoke<{ suggestions: any[] }>("places", { input, sessionToken })).suggestions;
    },
    async placeDetails(placeId, sessionToken) {
      return (await invoke<{ place: any }>("places", { placeId, sessionToken })).place;
    },

    quote: (input) => invoke<QuoteResponse>("quote", input),
    async createOrder(input) {
      const r = await invoke<{ order: Row }>("create-order", input);
      return { id: r.order.id, orderNo: r.order.order_no, totalKurus: r.order.total_kurus };
    },
    async listOrders() {
      const { data, error } = await client
        .from("orders")
        .select("id, order_no, status, pickup_address, dropoff_address, total_kurus, urgent, created_at")
        .eq("customer_id", await uid())
        .order("created_at", { ascending: false })
        .limit(100);
      fail(error, "Siparişler okunamadı");
      return (data ?? []).map(toSummary);
    },
    async getOrder(id) {
      const [o, h] = await Promise.all([
        // Kurye bilgisi RLS gereği yalnızca aktif teslimat sırasında döner
        client
          .from("orders")
          .select("*, courier:couriers(plate, profile:profiles(full_name, phone)), invoice:invoices(pdf_url), rating:order_ratings(score), secret:order_secrets(delivery_code)")
          .eq("id", id)
          .single(),
        client.from("order_status_history").select("to_status, created_at, note").eq("order_id", id).order("created_at"),
      ]);
      fail(o.error, "Sipariş okunamadı");
      const r = o.data as Row;
      return {
        ...toSummary(r!),
        pickupLat: r!.pickup_lat,
        pickupLng: r!.pickup_lng,
        dropoffLat: r!.dropoff_lat,
        dropoffLng: r!.dropoff_lng,
        waitingMinutes: r!.waiting_minutes ?? 0,
        arrivedPickupAt: r!.arrived_pickup_at ?? null,
        arrivedDropoffAt: r!.arrived_dropoff_at ?? null,
        failedReason: r!.failed_reason ?? null,
        failedAt: r!.failed_at ?? null,
        pickupDetails: r!.pickup_details,
        dropoffDetails: r!.dropoff_details,
        pickupContactName: r!.pickup_contact_name,
        pickupContactPhone: r!.pickup_contact_phone,
        dropoffContactName: r!.dropoff_contact_name,
        dropoffContactPhone: r!.dropoff_contact_phone,
        packageDescription: r!.package_description,
        customerNote: r!.customer_note,
        roundTrip: r!.round_trip,
        weightKg: r!.weight_kg == null ? null : Number(r!.weight_kg),
        scheduledPickupAt: r!.scheduled_pickup_at,
        priceQuote: r!.price_quote,
        durationSeconds: r!.duration_seconds ?? null,
        declaredValueKurus: r!.declared_value_kurus ?? null,
        deliveryCodeRequired: !!r!.delivery_code_required,
        // RLS: yalnız müşteri görür, kuryeye boş döner
        deliveryCode: (Array.isArray(r!.secret) ? r!.secret[0] : r!.secret)?.delivery_code ?? null,
        slaDueAt: r!.sla_due_at ?? null,
        slaMissed: r!.sla_missed ?? null,
        paymentMethod: r!.payment_method,
        paymentStatus: r!.payment_status,
        paidKurus: r!.paid_kurus ?? null,
        invoicePdfUrl: (Array.isArray(r!.invoice) ? r!.invoice[0] : r!.invoice)?.pdf_url ?? null,
        trackingToken: r!.tracking_token,
        rating: (Array.isArray(r!.rating) ? r!.rating[0] : r!.rating)?.score ?? null,
        courierName: r!.courier?.profile?.full_name ?? null,
        courierPhone: r!.courier?.profile?.phone ?? null,
        cancelReason: r!.cancel_reason,
        history: (h.data ?? []).map((x) => ({ status: x.to_status as OrderStatus, at: x.created_at, note: x.note })),
      } satisfies OrderDetail;
    },
    async cancelOrder(id, reason) {
      const { error } = await client.rpc("set_order_status", { p_order_id: id, p_status: "iptal", p_note: reason });
      if (error) throw new ApiError(error.message);
      // Kartla ödenmişse ödeme iptal edilir (ödeme yoksa sunucu bir şey yapmaz)
      await invoke("payment-refund", { orderId: id }).catch(() => undefined);
    },
    async startPayment(orderId, returnUrl) {
      return invoke<{ paymentPageUrl: string }>("payment-init", { orderId, ...(returnUrl ? { returnUrl } : {}) });
    },
    async rateOrder(order, score, comment) {
      const r = await invoke<{ googleReviewUrl: string | null }>("site-api", {
        action: "rate",
        token: order.trackingToken,
        score,
        comment: comment?.trim() || undefined,
        source: "uygulama",
      });
      return { googleReviewUrl: r.googleReviewUrl ?? null };
    },
    subscribeOrder(id, onChange) {
      const channel = client
        .channel(`order-${id}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` }, onChange)
        .subscribe();
      return () => {
        client.removeChannel(channel);
      };
    },

    watchCourierLocation(orderId, cb) {
      let closed = false;
      const fetchLatest = async () => {
        const { data } = await client
          .from("courier_locations")
          .select("lat, lng, recorded_at")
          .eq("order_id", orderId)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!closed) cb(data ? { lat: data.lat, lng: data.lng, recordedAt: data.recorded_at } : null);
      };
      fetchLatest().catch(() => undefined);
      // Realtime + yedek olarak periyodik okuma (bağlantı koparsa takip donmasın)
      const timer = setInterval(() => fetchLatest().catch(() => undefined), LOCATION_POLL_MS);
      const channel = client
        .channel(`order-loc-${orderId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "courier_locations", filter: `order_id=eq.${orderId}` },
          (p) => {
            const r = p.new as { lat: number; lng: number; recorded_at: string };
            if (!closed) cb({ lat: r.lat, lng: r.lng, recordedAt: r.recorded_at });
          },
        )
        .subscribe();
      return () => {
        closed = true;
        clearInterval(timer);
        client.removeChannel(channel);
      };
    },

    // ───────── Kurye
    async getOpenShift() {
      const id = await uid();
      const [s, b] = await Promise.all([
        client.from("courier_shifts").select("id, started_at").eq("courier_id", id).is("ended_at", null).maybeSingle(),
        client.from("courier_breaks").select("started_at, auto").eq("courier_id", id).is("ended_at", null).maybeSingle(),
      ]);
      fail(s.error, "Vardiya okunamadı");
      const data = s.data;
      return data
        ? ({ id: data.id, startedAt: data.started_at, break: b.data ? { startedAt: b.data.started_at, auto: !!b.data.auto } : null } satisfies Shift)
        : null;
    },
    async startShift(at) {
      const { data, error } = await client.rpc("start_shift", { p_lat: at?.lat ?? null, p_lng: at?.lng ?? null });
      if (error) throw new ApiError(error.message);
      return { id: data.id, startedAt: data.started_at, break: null };
    },
    async startBreak() {
      const { error } = await client.rpc("start_break");
      if (error) throw new ApiError(error.message);
    },
    async endBreak() {
      const { error } = await client.rpc("end_break");
      if (error) throw new ApiError(error.message);
    },
    async endShift(at) {
      const { error } = await client.rpc("end_shift", { p_lat: at?.lat ?? null, p_lng: at?.lng ?? null });
      if (error) throw new ApiError(error.message);
    },
    async listCourierJobs() {
      const todayStart = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10) + "T00:00:00+03:00";
      const { data, error } = await client
        .from("orders")
        .select(
          "id, order_no, status, pickup_address, dropoff_address, total_kurus, urgent, created_at, offer_expires_at, offer_accepted_at, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, sla_due_at",
        )
        .eq("courier_id", await uid())
        .or(`status.in.(kuryeye_atandi,alindi,yolda,sorunlu,geri_donuyor),completed_at.gte.${new Date(todayStart).toISOString()}`)
        .order("created_at", { ascending: true });
      fail(error, "İşler okunamadı");
      return (data ?? []).map(toSummary);
    },
    async respondOffer(orderId, accept, opts = {}) {
      const { data, error } = await client.rpc("respond_offer", {
        p_order_id: orderId,
        p_accept: accept,
        p_reason: opts.reason ?? null,
        p_timeout: !!opts.timeout,
      });
      if (error) throw new ApiError(error.message);
      return data as { ok: boolean; message: string | null };
    },
    async courierAction(orderId, action) {
      const rpc = async (p: Record<string, unknown>) => {
        const { error } = await client.rpc("set_order_status", { p_order_id: orderId, ...p });
        if (error) throw new ApiError(error.message);
      };
      switch (action.type) {
        case "pickup":
          await rpc({ p_status: "alindi", p_waiting_minutes: action.waitingMinutes });
          // Bekleme sunucuda varıştan ölçülür (yoksa girilen süre); ücret pricing.ts ile teklife eklenir
          await invoke("reprice-order", { orderId });
          return;
        case "on_the_way":
          return rpc({ p_status: "yolda" });
        case "problem":
          return rpc({ p_status: "sorunlu", p_note: action.note });
        case "release":
          return rpc({ p_status: "onaylandi", p_note: action.note });
        case "deliver":
        case "return_deliver": {
          const stamp = Date.now();
          const photoPath = action.pod.photoUri ? await uploadPod(orderId, `foto-${stamp}.jpg`, action.pod.photoUri) : null;
          let signaturePath: string | null = null;
          if (action.pod.signatureSvg) {
            signaturePath = `${orderId}/imza-${stamp}.svg`;
            const { error } = await client.storage
              .from("pod")
              .upload(signaturePath, action.pod.signatureSvg, { contentType: "image/svg+xml" });
            if (error) throw new ApiError(`İmza yüklenemedi: ${error.message}`);
          }
          return rpc({
            p_status: action.type === "deliver" ? "teslim_edildi" : "geri_teslim",
            p_pod_photo_path: photoPath,
            p_pod_signature_path: signaturePath,
            p_pod_receiver_name: action.pod.receiverName,
            p_cash_collection: action.pod.cashCollection ?? null,
          });
        }
      }
    },
    async reportFailedDelivery(orderId, input) {
      const photoPath = await uploadPod(orderId, `teslim-edilemedi-${Date.now()}.jpg`, input.photoUri);
      const { error } = await client.rpc("report_failed_delivery", {
        p_order_id: orderId,
        p_reason: input.reason,
        p_note: input.note.trim() || null,
        p_photo_path: photoPath,
        p_call_attempts: input.callAttempts,
      });
      if (error) throw new ApiError(error.message);
      // İade ücreti (dönüş ayağı) sunucuda pricing.ts ile eklenir
      await invoke("reprice-order", { orderId });
    },
    async pushLocation(loc, orderId) {
      const { error } = await client.from("courier_locations").insert({
        courier_id: await uid(),
        order_id: orderId,
        lat: loc.lat,
        lng: loc.lng,
        accuracy_m: loc.accuracy ?? null,
        heading: loc.heading ?? null,
        speed_mps: loc.speed ?? null,
      });
      if (error) throw new ApiError(error.message);
    },
    async raiseSos({ kind, note, at }) {
      const r = await invoke<{ id: string }>("sos", { kind, note: note ?? null, lat: at?.lat ?? null, lng: at?.lng ?? null, accuracy: at?.accuracy ?? null });
      return { id: r.id };
    },
    async myOpenIncident() {
      const { data, error } = await client
        .from("courier_incidents")
        .select("id, kind, created_at, acknowledged_at")
        .eq("courier_id", await uid())
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      fail(error, "Acil durum kaydı okunamadı");
      return data ? { id: data.id, kind: data.kind, createdAt: data.created_at, acknowledgedAt: data.acknowledged_at } : null;
    },
    async markArrived(orderId, stop, at) {
      const { data, error } = await client.rpc("mark_arrived", { p_order_id: orderId, p_stop: stop, p_lat: at?.lat ?? null, p_lng: at?.lng ?? null });
      if (error) throw new ApiError(error.message);
      return { arrivedAt: (data as { arrived_at: string }).arrived_at };
    },
    async courierEarnings() {
      const id = await uid();
      const [e, p, c] = await Promise.all([
        client
          .from("courier_earnings")
          .select("order_id, delivered_at, km, total_kurus, cash_collected_kurus, order:orders(order_no)")
          .eq("courier_id", id)
          .is("payout_id", null)
          .order("delivered_at", { ascending: false })
          .limit(500),
        client.from("courier_payouts").select("*").eq("courier_id", id).is("cancelled_at", null).order("created_at", { ascending: false }).limit(10),
        client.from("cost_settings").select("courier_per_job_kurus, courier_per_km_kurus").eq("id", 1).maybeSingle(),
      ]);
      fail(e.error, "Kazanç okunamadı");
      fail(p.error, "Hesaplaşmalar okunamadı");
      const items = (e.data ?? []).map((r: Row) => ({
        orderId: r.order_id,
        orderNo: r.order?.order_no ?? "",
        deliveredAt: r.delivered_at,
        km: Number(r.km),
        totalKurus: r.total_kurus,
        cashCollectedKurus: r.cash_collected_kurus,
      }));
      return {
        unpaid: courierBalance(items),
        items,
        payouts: (p.data ?? []).map((r: Row) => ({ id: r.id, createdAt: r.created_at, deliveryCount: r.delivery_count, netKurus: r.net_kurus, note: r.note })),
        rates: c.data ? { perJobKurus: c.data.courier_per_job_kurus, perKmKurus: c.data.courier_per_km_kurus } : null,
      };
    },
    async verifyDeliveryCode(orderId, code) {
      const { data, error } = await client.rpc("verify_delivery_code", { p_order_id: orderId, p_code: code });
      if (error) throw new ApiError(error.message);
      return data as { ok: boolean; remaining: number };
    },
    async myReferralCode() {
      const { data, error } = await client.rpc("my_referral_code");
      if (error) throw new ApiError(error.message);
      return data as string;
    },
    async courierDocuments() {
      const { data, error } = await client.from("courier_documents").select("kind, doc_number, expires_at").eq("courier_id", await uid());
      fail(error, "Belgeler okunamadı");
      return (data ?? []).map((r: Row) => ({ kind: r.kind, number: r.doc_number, expiresAt: r.expires_at }));
    },
    subscribeCourierJobs(onChange) {
      let channel: ReturnType<typeof client.channel> | null = null;
      let closed = false;
      uid().then((id) => {
        if (closed) return;
        channel = client
          .channel(`courier-${id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `courier_id=eq.${id}` }, onChange)
          .subscribe();
      }, () => undefined);
      return () => {
        closed = true;
        if (channel) client.removeChannel(channel);
      };
    },
  };
}
