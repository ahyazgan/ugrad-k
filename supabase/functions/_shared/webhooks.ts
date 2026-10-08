// Kurumsal webhook gönderici (webhook-dispatch, dakikalık cron). Her olay HMAC-SHA256 ile imzalanır:
//   X-Webhook-Signature: v1=<hex(HMAC(secret, `${timestamp}.${gövde}`))>, X-Webhook-Timestamp: <unix sn>
// 2xx dışı yanıt veya zaman aşımında üstel bekleme ile en fazla 8 kez denenir.
import { BRAND, trackingBaseUrl } from "../../../packages/shared/brand.ts";
import type { Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { HttpError, json } from "./http.ts";
import { hmacSha256Hex } from "./iyzico.ts";

export const WEBHOOK_MAX_ATTEMPTS = 8;
const TIMEOUT_MS = 10_000;

/** n. başarısız denemeden sonra bekleme: 1, 2, 4, … dk (en fazla 6 saat) */
export const retryDelayMs = (attempts: number) => Math.min(2 ** Math.max(0, attempts - 1), 360) * 60_000;

export async function signWebhook(secret: string, timestamp: number, body: string) {
  return `v1=${await hmacSha256Hex(secret, `${timestamp}.${body}`)}`;
}

/** Veritabanı olayını (snake_case) API ile aynı biçime çevirir */
export function webhookBody(id: number, payload: Record<string, unknown>, baseUrl = trackingBaseUrl) {
  const o = (payload.order ?? {}) as Record<string, unknown>;
  return {
    id,
    event: payload.event,
    occurredAt: payload.occurred_at,
    order: {
      id: o.id,
      orderNo: o.order_no,
      externalRef: o.external_ref ?? null,
      status: o.status,
      previousStatus: o.previous_status ?? null,
      totalKurus: o.total_kurus,
      trackingUrl: o.tracking_token ? `${baseUrl.replace(/\/$/, "")}/${o.tracking_token}` : null,
      deliveredAt: o.delivered_at ?? null,
      proofOfDelivery: o.pod_receiver_name ? { receiverName: o.pod_receiver_name } : null,
      cancelReason: o.cancel_reason ?? null,
    },
  };
}

interface Delivery {
  id: number;
  corporate_account_id: string;
  event: string;
  payload: unknown;
  attempts: number;
}

export async function handleWebhookDispatch(req: Request, ctx: Ctx, deps: { env: Env; fetchFn?: typeof fetch; now?: () => Date }) {
  const secret = deps.env("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) throw new HttpError(401, "Yetkisiz");
  await ctx.admin.rpc("record_heartbeat", { p_name: "webhook-dispatch" });
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? (() => new Date());

  const { data: claimed, error } = await ctx.admin.rpc("claim_webhook_deliveries", { p_limit: 20 });
  if (error) throw new Error(`Webhook kuyruğu okunamadı: ${error.message}`);
  const list = (claimed ?? []) as Delivery[];
  const accounts = [...new Set(list.map((d) => d.corporate_account_id))];
  const { data: hooks } = accounts.length
    ? await ctx.admin.from("corporate_webhooks").select("corporate_account_id, url, secret, active").in("corporate_account_id", accounts)
    : { data: [] };
  const hookOf = new Map(((hooks ?? []) as Array<{ corporate_account_id: string; url: string; secret: string; active: boolean }>).map((h) => [h.corporate_account_id, h]));

  const summary: Array<{ id: number; status: string; responseStatus?: number; error?: string }> = [];
  for (const d of list) {
    const hook = hookOf.get(d.corporate_account_id);
    if (!hook?.active) {
      await ctx.admin.from("webhook_deliveries").update({ status: "failed", last_error: "Webhook kapalı" }).eq("id", d.id);
      summary.push({ id: d.id, status: "failed", error: "Webhook kapalı" });
      continue;
    }
    const body = JSON.stringify(webhookBody(d.id, d.payload as Record<string, unknown>, deps.env("PUBLIC_TRACKING_BASE_URL") ?? trackingBaseUrl));
    const ts = Math.floor(now().getTime() / 1000);
    let responseStatus: number | undefined;
    let err: string | undefined;
    try {
      const res = await fetchFn(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": `${BRAND.name.replace(/\s+/g, "")}-Webhook/1`,
          "X-Webhook-Id": String(d.id),
          "X-Webhook-Event": d.event,
          "X-Webhook-Timestamp": String(ts),
          "X-Webhook-Signature": await signWebhook(hook.secret, ts, body),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      responseStatus = res.status;
      await res.body?.cancel().catch(() => undefined);
      if (!res.ok) err = `HTTP ${res.status}`;
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    if (!err) {
      await ctx.admin
        .from("webhook_deliveries")
        .update({ status: "delivered", delivered_at: now().toISOString(), response_status: responseStatus, last_error: null })
        .eq("id", d.id);
      summary.push({ id: d.id, status: "delivered", responseStatus });
    } else {
      const final = d.attempts >= WEBHOOK_MAX_ATTEMPTS;
      await ctx.admin
        .from("webhook_deliveries")
        .update({
          status: final ? "failed" : "pending",
          last_error: err.slice(0, 500),
          response_status: responseStatus ?? null,
          next_attempt_at: new Date(now().getTime() + retryDelayMs(d.attempts)).toISOString(),
          locked_at: null,
        })
        .eq("id", d.id);
      summary.push({ id: d.id, status: final ? "failed" : "retry", responseStatus, error: err });
    }
  }
  return json({ processed: summary.length, results: summary });
}
