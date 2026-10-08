// Acil teslim taahhüdü izleme (auto-dispatch her dakika çağırır): tahmini teslim taahhüdü aşacaksa
// veya aştıysa yöneticiye ve müşteriye bir kez haber verilir. Telafi kredisi teslimde veritabanında yazılır.
import { etaAt, formatTL, istanbulTime, slaState, urgentSurchargeKurus, type PriceQuote } from "../../../packages/shared/index.ts";
import { alertAdmins } from "./alerts.ts";
import { deliver, type Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { notificationConfig } from "./dispatch.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const ACTIVE = ["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda"];

export async function checkUrgentSla(ctx: Ctx, deps: { env: Env; fetchFn?: typeof fetch }, now: Date): Promise<string[]> {
  const { data } = await ctx.admin
    .from("orders")
    .select(
      "id, order_no, status, sla_due_at, delivered_at, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, duration_seconds, tracking_token, price_quote, payment_method, payment_status, " +
        "customer:profiles!orders_customer_id_fkey(phone, push_token), courier:couriers(last_lat, last_lng, last_location_at)",
    )
    .in("status", ACTIVE)
    .is("sla_alerted_at", null)
    .gte("sla_due_at", new Date(now.getTime() - 6 * 3_600_000).toISOString());
  const cfg = notificationConfig(deps.env);
  const alerted: string[] = [];
  for (const o of (data ?? []) as Row[]) {
    if (!o.sla_due_at) continue;
    // Ödenmemiş kart siparişi henüz işleme girmedi
    if (o.payment_method === "kart" && o.payment_status !== "odendi") continue;
    const c = o.courier;
    const fresh = c?.last_lat != null && c?.last_location_at && now.getTime() - new Date(c.last_location_at).getTime() < 15 * 60_000;
    const eta = etaAt(
      {
        status: o.status,
        pickup: { lat: o.pickup_lat, lng: o.pickup_lng },
        dropoff: { lat: o.dropoff_lat, lng: o.dropoff_lng },
        durationSeconds: o.duration_seconds,
      },
      fresh ? { lat: c.last_lat, lng: c.last_lng } : null,
      now,
    );
    const state = slaState({ slaDueAt: o.sla_due_at, deliveredAt: null, status: o.status }, eta, now);
    if (state !== "riskli" && state !== "gecikti") continue;

    const due = istanbulTime(o.sla_due_at);
    const etaText = eta ? istanbulTime(eta) : "belirsiz";
    await alertAdmins(
      "Acil teslim gecikme riski",
      `${o.order_no} acil: taahhüt ${due}, tahmini teslim ${etaText}${o.courier ? "" : " (kurye atanmadı)"}`,
      deps,
    ).catch((e) => console.error("sla admin uyarısı", e));
    const credit = urgentSurchargeKurus((o.price_quote ?? { lines: [] }) as PriceQuote);
    const url = `${cfg.trackingBaseUrl.replace(/\/$/, "")}/${o.tracking_token}`;
    const text =
      `${o.order_no} numaralı acil siparişiniz yoğunluk nedeniyle gecikebilir; tahmini teslim ${etaText} (taahhüt ${due}). ` +
      (credit > 0 ? `Taahhüt aşılırsa acil ek ücreti (${formatTL(credit)}) sonraki siparişinizden düşülür. ` : "") +
      `Takip: ${url}`;
    if (o.customer?.phone || o.customer?.push_token) {
      await deliver(
        {
          to: { role: "customer", phone: o.customer.phone, pushToken: o.customer.push_token },
          channels: ["push", "whatsapp", "sms"],
          title: "Teslimat gecikebilir",
          text,
          whatsappTemplate: { name: "acil_gecikme", params: [o.order_no, etaText, url] },
        },
        deps,
      ).catch((e) => console.error("sla müşteri bildirimi", e));
    }
    await ctx.admin.from("orders").update({ sla_alerted_at: now.toISOString() }).eq("id", o.id);
    alerted.push(o.id);
  }
  return alerted;
}
