// Bildirim kuyruğunu işler (notify-dispatch).
import {
  buildEventNotifications,
  buildNotifications,
  type NotificationKind,
  type NotificationConfig,
  type NotificationOrder,
  type OrderStatus,
  trackingBaseUrl,
} from "../../../packages/shared/index.ts";
import { deliver, type DeliveryResult, type Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { HttpError, json } from "./http.ts";

const MAX_ATTEMPTS = 5;

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export function toNotificationOrder(r: Row): NotificationOrder {
  const courier = r.courier?.profile;
  return {
    orderNo: r.order_no,
    status: r.status,
    urgent: r.urgent,
    trackingToken: r.tracking_token,
    pickupAddress: r.pickup_address,
    dropoffAddress: r.dropoff_address,
    pickupContactName: r.pickup_contact_name ?? null,
    pickupContactPhone: r.pickup_contact_phone ?? null,
    dropoffContactName: r.dropoff_contact_name,
    dropoffContactPhone: r.dropoff_contact_phone,
    podReceiverName: r.pod_receiver_name,
    cancelReason: r.cancel_reason,
    problemNote: r.problem_note,
    failedReason: r.failed_reason ?? null,
    returnReceiverName: r.return_receiver_name ?? null,
    deliveryCode: (Array.isArray(r.secret) ? r.secret[0] : r.secret)?.delivery_code ?? null,
    assignment: r.offer_expires_at ? (r.offer_accepted_at ? "accepted" : "offer") : "direct",
    customer: {
      fullName: r.customer?.full_name ?? null,
      phone: r.customer?.phone ?? null,
      pushToken: r.customer?.push_token ?? null,
    },
    courier: courier ? { fullName: courier.full_name, phone: courier.phone, pushToken: courier.push_token } : null,
  };
}

export function notificationConfig(env: Env): NotificationConfig {
  return {
    trackingBaseUrl: env("PUBLIC_TRACKING_BASE_URL") ?? trackingBaseUrl,
    adminPhones: (env("ADMIN_ALERT_PHONES") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export async function handleNotifyDispatch(
  req: Request,
  ctx: Ctx,
  deps: { env: Env; fetchFn?: typeof fetch },
): Promise<Response> {
  const secret = deps.env("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) throw new HttpError(401, "Yetkisiz");
  await ctx.admin.rpc("record_heartbeat", { p_name: "notify-dispatch" });

  const { data: claimed, error } = await ctx.admin.rpc("claim_notifications", { p_limit: 20 });
  if (error) throw new Error(`Kuyruk okunamadı: ${error.message}`);
  const cfg = notificationConfig(deps.env);
  const summary: Array<{ id: number; status: string; results: DeliveryResult[] }> = [];

  for (const n of (claimed ?? []) as Row[]) {
    let results: DeliveryResult[] = [];
    let status: string;
    let lastError: string | null = null;
    try {
      const { data: order, error: oErr } = await ctx.admin
        .from("orders")
        .select(
          "*, customer:profiles!orders_customer_id_fkey(full_name, phone, push_token), courier:couriers(profile:profiles(full_name, phone, push_token)), secret:order_secrets(delivery_code)",
        )
        .eq("id", n.order_id)
        .single();
      if (oErr || !order) throw new Error(`Sipariş okunamadı: ${oErr?.message}`);
      const messages =
        n.kind && n.kind !== "durum"
          ? buildEventNotifications(n.kind as NotificationKind, toNotificationOrder(order), cfg)
          : buildNotifications(n.event as OrderStatus, toNotificationOrder(order), cfg);
      results = await Promise.all(messages.map((m) => deliver(m, deps)));
      const failed = results.filter((r) => !r.ok);
      if (!messages.length) status = "skipped";
      else if (!failed.length) status = "sent";
      else {
        lastError = failed.map((f) => `${f.role}: ${f.error}`).join("; ");
        status = n.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      status = n.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
    }
    await ctx.admin
      .from("notifications")
      .update({
        status,
        results,
        last_error: lastError,
        locked_at: null,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", n.id);
    summary.push({ id: n.id, status, results });
  }
  return json({ processed: summary.length, summary });
}
