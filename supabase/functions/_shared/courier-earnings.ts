// Kurye hakedişi: teslim edilen her siparişin kurye kazancını courier_earnings tablosuna yazar.
// pg_cron ile 5 dakikada bir (x-notify-secret) veya panelden yönetici tetikler. Hesap packages/shared/cost.ts.
import { costModelFromRow, courierEarning, DEFAULT_COST_MODEL, type CostSettingsRow, type PriceQuote } from "../../../packages/shared/index.ts";
import type { Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { HttpError, json } from "./http.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function authorize(req: Request, ctx: Ctx, env: Env) {
  const secret = env("NOTIFY_SECRET");
  if (secret && req.headers.get("x-notify-secret") === secret) return "cron";
  if (req.headers.get("Authorization")) {
    const user = await ctx.getUser(req);
    const { data } = await ctx.admin.from("profiles").select("role").eq("id", user.id).single();
    if (data?.role === "admin") return "admin";
  }
  throw new HttpError(401, "Yetkisiz");
}

/** Teklifi olmayan (eski) siparişlerde mesafeden asgari meta */
function quoteOf(o: Row): Pick<PriceQuote, "lines" | "meta"> {
  const q = o.price_quote as Partial<PriceQuote> | null;
  if (q?.meta && Array.isArray(q.lines)) return q as PriceQuote;
  return {
    lines: [],
    meta: {
      distanceKm: Math.ceil((o.distance_meters ?? 0) / 1000),
      returnDistanceKm: o.return_distance_meters ? Math.ceil(o.return_distance_meters / 1000) : null,
      nightOrHoliday: false,
      holidayName: null,
      surchargePct: 0,
      serviceLevel: o.service_level ?? (o.urgent ? "acil" : "standart"),
    },
  };
}

export function earningRow(o: Row, model = DEFAULT_COST_MODEL, settings?: { freePickupRadiusKm: number }) {
  const e = courierEarning(quoteOf(o), model, settings);
  return {
    order_id: o.id,
    courier_id: o.courier_id,
    // İade edilen işte tamamlanma (göndericiye teslim) anı
    delivered_at: o.completed_at ?? o.delivered_at ?? new Date().toISOString(),
    km: e.km,
    job_kurus: e.jobKurus,
    km_kurus: e.kmKurus,
    bonus_kurus: e.bonusKurus,
    waiting_kurus: e.waitingKurus,
    bridge_kurus: e.bridgeKurus,
    total_kurus: e.totalKurus,
    cash_collected_kurus: o.payment_method === "nakit" && o.cash_collection === "nakit" ? o.total_kurus : 0,
  };
}

export async function handleCourierEarnings(req: Request, ctx: Ctx, deps: { env: Env }): Promise<Response> {
  const trigger = await authorize(req, ctx, deps.env);
  if (trigger === "cron") await ctx.admin.rpc("record_heartbeat", { p_name: "courier-earnings" });
  const { data: pending, error } = await ctx.admin.rpc("pending_courier_earnings", { p_limit: 200 });
  if (error) throw new Error(`Bekleyen hakedişler okunamadı: ${error.message}`);
  const orders = (pending ?? []) as Row[];
  let written = 0;
  if (orders.length) {
    const [{ data: costRow }, { settings }] = await Promise.all([
      ctx.admin.from("cost_settings").select("*").eq("id", 1).single(),
      ctx.loadPricing(),
    ]);
    const model = costRow ? costModelFromRow(costRow as CostSettingsRow) : DEFAULT_COST_MODEL;
    const rows = orders.map((o) => earningRow(o, model, settings));
    // Aynı anda iki çalıştırma olursa çift kayıt oluşmaz (order_id birincil anahtar)
    const { error: insErr } = await ctx.admin.from("courier_earnings").upsert(rows, { onConflict: "order_id", ignoreDuplicates: true });
    if (insErr) throw new Error(`Hakediş yazılamadı: ${insErr.message}`);
    written = rows.length;
  }
  // Hedef primleri: kapanan gün/haftaların ödülleri (hakedişler yazıldıktan sonra; tekrar çalıştırılabilir)
  const { data: awards, error: awardErr } = await ctx.admin.rpc("compute_incentive_awards");
  if (awardErr) throw new Error(`Primler hesaplanamadı: ${awardErr.message}`);
  return json({ trigger, written, awards: typeof awards === "number" ? awards : 0 });
}
