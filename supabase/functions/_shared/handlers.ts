// İş mantığı — Deno.serve'den bağımsız, sahte Ctx ile test edilebilir.
import {
  buildQuote,
  orderRowFromQuote,
  parseOrderRequest,
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

export async function handleCreateOrder(req: Request, ctx: Ctx): Promise<Response> {
  const user = await ctx.getUser(req);
  const order = parseOrderRequest(await readJson(req));

  const { data: profile, error: pErr } = await ctx.admin
    .from("profiles")
    .select("id, role, corporate_account_id")
    .eq("id", user.id)
    .single();
  if (pErr || !profile) throw new HttpError(403, "Profil bulunamadı");

  // KVKK: aydınlatma metni ve konum açık rızası olmadan sipariş alınmaz
  const { data: consents } = await ctx.admin
    .from("current_consents")
    .select("consent_type, granted")
    .eq("profile_id", user.id);
  const granted = new Set((consents ?? []).filter((c) => c.granted).map((c) => c.consent_type));
  if (!granted.has("kvkk_aydinlatma") || !granted.has("acik_riza_konum")) {
    throw new HttpError(403, "Sipariş için KVKK aydınlatma metnini ve açık rızayı onaylamanız gerekiyor");
  }

  if (order.paymentMethod === "cari" && !profile.corporate_account_id) {
    throw new HttpError(400, "Cari hesap ile ödeme yalnızca kurumsal müşteriler içindir", "paymentMethod");
  }

  // Fiyat her zaman sunucuda yeniden hesaplanır; istemcinin gönderdiği fiyata güvenilmez.
  const pricing = await ctx.loadPricing();
  const q = await buildQuote(order, { maps: ctx.maps, ...pricing });

  const { data, error } = await ctx.admin
    .from("orders")
    .insert({
      ...orderRowFromQuote(order, q),
      customer_id: user.id,
      corporate_account_id: profile.corporate_account_id,
      payment_status: order.paymentMethod === "cari" ? "cari_hesap" : "odenmedi",
    })
    .select("id, order_no, status, total_kurus, tracking_token, created_at")
    .single();
  if (error) throw new Error(`Sipariş kaydedilemedi: ${error.message}`);

  return json({ order: data, ...quoteResponse(q) }, 201);
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
