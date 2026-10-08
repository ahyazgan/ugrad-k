// İş mantığı — Deno.serve'den bağımsız, sahte Ctx ile test edilebilir.
import {
  applyWaitingFee,
  buildQuote,
  orderRowFromQuote,
  parseOrderRequest,
  type OrderRequest,
  type PriceQuote,
  type QuoteResult,
} from "../../../packages/shared/index.ts";
import type { Ctx } from "./context.ts";
import { HttpError, json, readJson } from "./http.ts";

function quoteResponse(q: QuoteResult) {
  return {
    quote: q.quote,
    distanceMeters: q.distanceMeters,
    returnDistanceMeters: q.returnDistanceMeters,
    durationSeconds: q.durationSeconds,
    pickupSide: q.pickupSide,
    dropoffSide: q.dropoffSide,
    bridgeCrossings: q.bridgeCrossings,
  };
}

export async function handleQuote(req: Request, ctx: Ctx): Promise<Response> {
  await ctx.getUser(req);
  const order = parseOrderRequest(await readJson(req));
  const pricing = await ctx.loadPricing();
  const q = await buildQuote(order, { maps: ctx.maps, ...pricing });
  return json(quoteResponse(q));
}

/**
 * Sipariş oluşturmanın tek yolu (uygulama, asistan, panel). KVKK rızası ve cari
 * hesap kontrol edilir; fiyat her zaman sunucuda pricing.ts ile yeniden hesaplanır.
 */
export async function createOrderForCustomer(ctx: Ctx, userId: string, order: OrderRequest) {
  const { data: profile, error: pErr } = await ctx.admin
    .from("profiles")
    .select("id, role, corporate_account_id")
    .eq("id", userId)
    .single();
  if (pErr || !profile) throw new HttpError(403, "Profil bulunamadı");

  // KVKK: aydınlatma metni ve konum açık rızası olmadan sipariş alınmaz
  const { data: consents } = await ctx.admin
    .from("current_consents")
    .select("consent_type, granted")
    .eq("profile_id", userId);
  const granted = new Set((consents ?? []).filter((c) => c.granted).map((c) => c.consent_type));
  if (!granted.has("kvkk_aydinlatma") || !granted.has("acik_riza_konum")) {
    throw new HttpError(403, "Sipariş için KVKK aydınlatma metnini ve açık rızayı onaylamanız gerekiyor");
  }

  if (order.paymentMethod === "cari" && !profile.corporate_account_id) {
    throw new HttpError(400, "Cari hesap ile ödeme yalnızca kurumsal müşteriler içindir", "paymentMethod");
  }

  const pricing = await ctx.loadPricing();
  const q = await buildQuote(order, { maps: ctx.maps, ...pricing });

  const { data, error } = await ctx.admin
    .from("orders")
    .insert({
      ...orderRowFromQuote(order, q),
      customer_id: userId,
      corporate_account_id: profile.corporate_account_id,
      payment_status: order.paymentMethod === "cari" ? "cari_hesap" : "odenmedi",
    })
    .select("id, order_no, status, total_kurus, tracking_token, created_at")
    .single();
  if (error) throw new Error(`Sipariş kaydedilemedi: ${error.message}`);
  return { order: data, quote: q };
}

export async function handleCreateOrder(req: Request, ctx: Ctx): Promise<Response> {
  const user = await ctx.getUser(req);
  const order = parseOrderRequest(await readJson(req));
  const { order: data, quote } = await createOrderForCustomer(ctx, user.id, order);
  return json({ order: data, ...quoteResponse(quote) }, 201);
}

export async function handlePlaces(req: Request, ctx: Ctx): Promise<Response> {
  await ctx.getUser(req);
  const body = (await readJson(req)) as Record<string, unknown>;
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : undefined;

  if (typeof body.placeId === "string" && body.placeId) {
    return json({ place: await ctx.maps.placeDetails(body.placeId, sessionToken) });
  }
  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (input.length < 3) return json({ suggestions: [] });
  if (input.length > 200) throw new HttpError(400, "Arama metni çok uzun");
  return json({ suggestions: await ctx.maps.autocomplete(input, sessionToken) });
}

/**
 * Kurye alışta bekleme süresini girdikten sonra çağrılır: bekleme ücretini
 * teklife ekler. İdempotenttir; siparişin güncel bekleme süresinden hesaplar.
 */
export async function handleRepriceOrder(req: Request, ctx: Ctx): Promise<Response> {
  const user = await ctx.getUser(req);
  const body = (await readJson(req)) as { orderId?: unknown };
  if (typeof body.orderId !== "string") throw new HttpError(400, "orderId gerekli", "orderId");

  const { data: order, error } = await ctx.admin
    .from("orders")
    .select("id, courier_id, status, waiting_minutes, price_quote, total_kurus")
    .eq("id", body.orderId)
    .single();
  if (error || !order) throw new HttpError(404, "Sipariş bulunamadı");

  if (order.courier_id !== user.id) {
    const { data: p } = await ctx.admin.from("profiles").select("role").eq("id", user.id).single();
    if (p?.role !== "admin") throw new HttpError(403, "Bu sipariş için yetkiniz yok");
  }
  if (["teslim_edildi", "iptal"].includes(order.status) && order.courier_id === user.id) {
    throw new HttpError(409, "Kapanmış siparişin fiyatı değiştirilemez");
  }

  const { settings } = await ctx.loadPricing();
  const quote: PriceQuote = applyWaitingFee(order.price_quote, order.waiting_minutes ?? 0, settings);
  const changed = quote.totalKurus !== order.total_kurus;
  if (changed) {
    const { error: uErr } = await ctx.admin
      .from("orders")
      .update({
        price_quote: quote,
        subtotal_kurus: quote.subtotalKurus,
        vat_kurus: quote.vatKurus,
        total_kurus: quote.totalKurus,
      })
      .eq("id", order.id);
    if (uErr) throw new Error(`Fiyat güncellenemedi: ${uErr.message}`);
  }
  return json({ quote, changed });
}

/** Kullanıcının kendi hesabını silmesi: kişisel veriler anonimleştirilir, oturum kimliği kaldırılır. */
export async function handleAccountDelete(req: Request, ctx: Ctx): Promise<Response> {
  const user = await ctx.getUser(req);
  const { error } = await ctx.admin.rpc("anonymize_profile", { p_id: user.id });
  if (error) {
    if (error.code === "22023") throw new HttpError(409, error.message);
    throw new Error(`Hesap silinemedi: ${error.message}`);
  }
  // Soft delete: auth kaydı anonimleşir, siparişlerdeki ilişki (vergi kaydı) bozulmaz
  const { error: aErr } = await ctx.admin.auth.admin.deleteUser(user.id, true);
  if (aErr) throw new Error(`Oturum kaydı silinemedi: ${aErr.message}`);
  return json({ deleted: true });
}
