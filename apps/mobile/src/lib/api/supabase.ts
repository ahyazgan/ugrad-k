import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, FunctionsHttpError, type SupabaseClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@yazgan/shared";
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
} from "./types";

/** "0532 123 45 67" → "+905321234567" */
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^(90|0)/, "");
  if (!/^5\d{9}$/.test(digits)) throw new ApiError("Geçerli bir cep telefonu numarası girin", "phone");
  return `+90${digits}`;
}

type Row = Record<string, any>;

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
        client.from("orders").select("*, courier:couriers(plate, profile:profiles(full_name, phone))").eq("id", id).single(),
        client.from("order_status_history").select("to_status, created_at, note").eq("order_id", id).order("created_at"),
      ]);
      fail(o.error, "Sipariş okunamadı");
      const r = o.data as Row;
      return {
        ...toSummary(r!),
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
        paymentMethod: r!.payment_method,
        paymentStatus: r!.payment_status,
        trackingToken: r!.tracking_token,
        courierName: r!.courier?.profile?.full_name ?? null,
        courierPhone: r!.courier?.profile?.phone ?? null,
        cancelReason: r!.cancel_reason,
        history: (h.data ?? []).map((x) => ({ status: x.to_status as OrderStatus, at: x.created_at, note: x.note })),
      } satisfies OrderDetail;
    },
    async cancelOrder(id, reason) {
      const { error } = await client.rpc("set_order_status", { p_order_id: id, p_status: "iptal", p_note: reason });
      if (error) throw new ApiError(error.message);
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
  };
}
