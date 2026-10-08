// Kurumsal REST API (v1). Kimlik: "Authorization: Bearer yk_live_..." (veya X-Api-Key).
// Siparişler anahtarın bağlı olduğu kurumsal kullanıcı adına, cari hesapla açılır.
// Belge: web sitesi /api-belgeleri
import {
  buildQuote,
  ORDER_STATUS_LABELS,
  parseOrderRequest,
  trackingBaseUrl,
  type OrderStatus,
} from "../../../packages/shared/index.ts";
import type { Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { createOrderForCustomer, quoteResponse } from "./handlers.ts";
import { HttpError, json } from "./http.ts";
import { rateLimit } from "./site.ts";

// deno-lint-ignore no-explicit-any
type Body = Record<string, any>;
type Row = Record<string, unknown>;

export const API_RATE_LIMIT = { perKey: 120, windowSeconds: 60 };
const ORDER_COLUMNS =
  "id, order_no, external_ref, status, created_at, scheduled_pickup_at, picked_up_at, delivered_at, pickup_address, dropoff_address, urgent, service_level, round_trip, declared_value_kurus, delivery_code_required, subtotal_kurus, vat_kurus, total_kurus, tracking_token, pod_receiver_name, cancel_reason";

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface ApiKey {
  id: string;
  corporate_account_id: string;
  profile_id: string;
}

async function authenticate(req: Request, ctx: Ctx): Promise<ApiKey> {
  const raw =
    req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!raw.startsWith("yk_")) throw new HttpError(401, "API anahtarı gerekli (Authorization: Bearer yk_live_...)");
  const { data } = await ctx.admin
    .from("api_keys")
    .select("id, corporate_account_id, profile_id, revoked_at")
    .eq("key_hash", await sha256Hex(raw))
    .maybeSingle();
  if (!data || data.revoked_at) throw new HttpError(401, "API anahtarı geçersiz veya iptal edilmiş");
  return data as ApiKey;
}

export function apiOrder(r: Row, baseUrl = trackingBaseUrl) {
  const status = r.status as OrderStatus;
  return {
    id: r.id,
    orderNo: r.order_no,
    externalRef: r.external_ref ?? null,
    status,
    statusLabel: ORDER_STATUS_LABELS[status],
    createdAt: r.created_at,
    scheduledPickupAt: r.scheduled_pickup_at ?? null,
    pickedUpAt: r.picked_up_at ?? null,
    deliveredAt: r.delivered_at ?? null,
    pickup: { address: r.pickup_address },
    dropoff: { address: r.dropoff_address },
    serviceLevel: r.service_level ?? (r.urgent ? "acil" : "standart"),
    urgent: r.urgent,
    roundTrip: r.round_trip,
    declaredValueKurus: r.declared_value_kurus ?? null,
    deliveryCodeRequired: !!r.delivery_code_required,
    subtotalKurus: r.subtotal_kurus,
    vatKurus: r.vat_kurus,
    totalKurus: r.total_kurus,
    trackingUrl: `${baseUrl.replace(/\/$/, "")}/${r.tracking_token}`,
    proofOfDelivery: r.pod_receiver_name ? { receiverName: r.pod_receiver_name } : null,
    cancelReason: r.cancel_reason ?? null,
  };
}

/** Adres: { address, lat, lng } (önerilir) veya yalnız { address } → harita servisinden ilk sonuç */
async function resolvePoint(ctx: Ctx, p: unknown, field: string): Promise<Body> {
  if (!p || typeof p !== "object") throw new HttpError(400, `${field} zorunlu`, field);
  const o = p as Body;
  if (o.lat != null && o.lng != null) return o;
  if (typeof o.address !== "string" || o.address.trim().length < 5) {
    throw new HttpError(400, `${field}.address veya ${field}.lat/lng gerekli`, field);
  }
  const [first] = await ctx.maps.autocomplete(o.address.trim().slice(0, 200));
  if (!first) throw new HttpError(422, `${field} adresi bulunamadı; lat/lng gönderin`, field);
  const place = await ctx.maps.placeDetails(first.placeId);
  return { ...o, address: o.address.trim(), lat: place.lat, lng: place.lng, district: o.district ?? place.district };
}

async function orderRequest(ctx: Ctx, b: Body) {
  const [pickup, dropoff] = await Promise.all([resolvePoint(ctx, b.pickup, "pickup"), resolvePoint(ctx, b.dropoff, "dropoff")]);
  // API siparişleri her zaman cari hesaba (ay sonu fatura)
  return parseOrderRequest({ ...b, pickup, dropoff, paymentMethod: "cari" });
}

async function readBody(req: Request): Promise<Body> {
  try {
    const b = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
    return b as Body;
  } catch {
    throw new HttpError(400, "Geçersiz JSON gövdesi");
  }
}

async function findOrder(ctx: Ctx, key: ApiKey, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Sipariş bulunamadı");
  const { data } = await ctx.admin
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", id)
    .eq("corporate_account_id", key.corporate_account_id)
    .maybeSingle();
  if (!data) throw new HttpError(404, "Sipariş bulunamadı");
  return data as Row;
}

export async function handleCorporateApi(req: Request, ctx: Ctx, deps: { env: Env }): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const route = path.slice(path.indexOf("/v1") + 3) || "/";
  if (!path.includes("/v1")) throw new HttpError(404, "Bilinmeyen adres; /v1/... kullanın");
  const key = await authenticate(req, ctx);
  await rateLimit(ctx, `api:${key.id}`, API_RATE_LIMIT.perKey, API_RATE_LIMIT.windowSeconds);
  void ctx.admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  const base = deps.env("PUBLIC_TRACKING_BASE_URL") ?? trackingBaseUrl;
  const m = req.method;

  if (route === "/ping" && m === "GET") {
    const { data: acc } = await ctx.admin.from("corporate_accounts").select("company_name").eq("id", key.corporate_account_id).single();
    return json({ ok: true, account: acc?.company_name ?? null });
  }

  if (route === "/quotes" && m === "POST") {
    const order = await orderRequest(ctx, await readBody(req));
    const pricing = await ctx.loadPricing();
    return json(quoteResponse(await buildQuote(order, { maps: ctx.maps, ...pricing })));
  }

  if (route === "/orders" && m === "POST") {
    const b = await readBody(req);
    const externalRef = typeof b.externalRef === "string" && b.externalRef.trim() ? b.externalRef.trim().slice(0, 100) : null;
    // Aynı dış referans tekrar gönderilirse yeni sipariş açılmaz, mevcut sipariş döner (güvenli tekrar deneme)
    if (externalRef) {
      const { data: existing } = await ctx.admin
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("corporate_account_id", key.corporate_account_id)
        .eq("external_ref", externalRef)
        .maybeSingle();
      if (existing) return json({ order: apiOrder(existing as Row, base), duplicate: true }, 200);
    }
    const order = await orderRequest(ctx, b);
    const { order: created, quote } = await createOrderForCustomer(ctx, key.profile_id, order, {
      api_key_id: key.id,
      external_ref: externalRef,
    });
    const full = await findOrder(ctx, key, (created as Row).id as string).catch(() => created as Row);
    // Teslim kodu yalnız oluşturma yanıtında döner (alıcıya ayrıca SMS ile gider)
    let deliveryCode: string | null = null;
    if (order.deliveryCode) {
      const { data: sec } = await ctx.admin.from("order_secrets").select("delivery_code").eq("order_id", (created as Row).id).maybeSingle();
      deliveryCode = ((sec as Row | null)?.delivery_code as string | undefined) ?? null;
    }
    return json({ order: { ...apiOrder({ ...full, external_ref: externalRef }, base), deliveryCode }, quote: quote.quote }, 201);
  }

  if (route === "/orders" && m === "GET") {
    const q = new URL(req.url).searchParams;
    const limit = Math.min(Math.max(Number(q.get("limit") ?? 50) || 50, 1), 200);
    let query = ctx.admin
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("corporate_account_id", key.corporate_account_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    const status = q.get("status");
    if (status) {
      if (!(status in ORDER_STATUS_LABELS)) throw new HttpError(400, "status geçersiz", "status");
      query = query.eq("status", status);
    }
    const ext = q.get("externalRef");
    if (ext) query = query.eq("external_ref", ext);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return json({ orders: ((data ?? []) as Row[]).map((r) => apiOrder(r, base)) });
  }

  const one = route.match(/^\/orders\/([^/]+)$/);
  if (one && m === "GET") return json({ order: apiOrder(await findOrder(ctx, key, one[1]!), base) });

  const cancel = route.match(/^\/orders\/([^/]+)\/cancel$/);
  if (cancel && m === "POST") {
    const b = await readBody(req).catch(() => ({}) as Body);
    const reason = typeof b.reason === "string" ? b.reason.slice(0, 300) : "";
    const { data: r, error } = await ctx.admin.rpc("api_cancel_order", {
      p_order_id: cancel[1],
      p_corporate_account_id: key.corporate_account_id,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    if (r === "not_found") throw new HttpError(404, "Sipariş bulunamadı");
    if (r === "not_cancellable") throw new HttpError(409, "Kurye yola çıktıktan sonra sipariş iptal edilemez");
    return json({ order: apiOrder(await findOrder(ctx, key, cancel[1]!), base) });
  }

  throw new HttpError(404, "Bilinmeyen adres");
}
