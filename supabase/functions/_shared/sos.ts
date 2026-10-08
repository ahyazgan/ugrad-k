// Acil durum (SOS): kurye uygulaması çağırır; alarm kaydedilir ve yöneticilere hemen WhatsApp/SMS gider.
// Görülmeyen alarmların yeniden gönderimi auto-dispatch'te (resendUnacknowledgedSos).
import { isIncidentKind, SOS_MAX_ALERTS, SOS_REALERT_MINUTES, sosAlertText, type IncidentKind } from "../../../packages/shared/index.ts";
import { deliver, type Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { notificationConfig } from "./dispatch.ts";
import { HttpError, json, readJson } from "./http.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function alertAdmins(ctx: Ctx, deps: { env: Env; fetchFn?: typeof fetch }, incident: Row, repeat: number, now: Date) {
  const [{ data: profile }, { data: order }] = await Promise.all([
    ctx.admin.from("profiles").select("full_name, phone").eq("id", incident.courier_id).single(),
    incident.order_id
      ? ctx.admin.from("orders").select("order_no").eq("id", incident.order_id).single()
      : Promise.resolve({ data: null }),
  ]);
  const text = sosAlertText({
    kind: incident.kind as IncidentKind,
    courierName: (profile as Row | null)?.full_name ?? null,
    courierPhone: (profile as Row | null)?.phone ?? null,
    lat: incident.lat,
    lng: incident.lng,
    accuracyM: incident.accuracy_m,
    note: incident.note,
    orderNo: (order as Row | null)?.order_no ?? null,
    repeat,
  });
  const cfg = notificationConfig(deps.env);
  const results = await Promise.all(
    cfg.adminPhones.map((phone) =>
      deliver(
        { to: { role: "admin", phone }, channels: ["whatsapp", "sms"], title: "ACİL DURUM", text, whatsappTemplate: { name: "yonetici_uyari", params: [text] } },
        { env: deps.env, fetchFn: deps.fetchFn },
      ),
    ),
  );
  await ctx.admin.from("courier_incidents").update({ alert_count: repeat, last_alert_at: now.toISOString() }).eq("id", incident.id);
  return results;
}

export async function handleSos(req: Request, ctx: Ctx, deps: { env: Env; fetchFn?: typeof fetch; now?: Date }): Promise<Response> {
  const user = await ctx.getUser(req);
  const { data: me } = await ctx.admin.from("profiles").select("role").eq("id", user.id).single();
  if ((me as Row | null)?.role !== "kurye") throw new HttpError(403, "Yalnız kuryeler acil durum bildirebilir");
  const body = (await readJson(req)) as Row;
  if (!isIncidentKind(body.kind)) throw new HttpError(400, "Acil durum türü geçersiz", "kind");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : null;
  const { data: incident, error } = await ctx.admin.rpc("raise_sos", {
    p_courier_id: user.id,
    p_kind: body.kind,
    p_lat: num(body.lat),
    p_lng: num(body.lng),
    p_accuracy: num(body.accuracy),
    p_note: note || null,
  });
  if (error || !incident) throw new Error(`Alarm kaydedilemedi: ${error?.message}`);
  const i = incident as Row;
  // İlk basışta hemen; 2 dk içindeki tekrar basışta yeniden gönderilmez (konum güncellenir)
  const results = i.alert_count ? [] : await alertAdmins(ctx, deps, i, 1, deps.now ?? new Date());
  return json({ id: i.id, createdAt: i.created_at, alerted: results.filter((r) => r.ok).length });
}

/** Görülmeyen alarmları 5 dakikada bir, en fazla 3 kez yeniden gönderir (auto-dispatch) */
export async function resendUnacknowledgedSos(ctx: Ctx, deps: { env: Env; fetchFn?: typeof fetch }, now: Date): Promise<string[]> {
  const { data } = await ctx.admin
    .from("courier_incidents")
    .select("*")
    .is("resolved_at", null)
    .is("acknowledged_at", null);
  const due = ((data ?? []) as Row[]).filter(
    (i) => i.alert_count < SOS_MAX_ALERTS && (!i.last_alert_at || now.getTime() - new Date(i.last_alert_at).getTime() >= SOS_REALERT_MINUTES * 60_000),
  );
  for (const i of due) await alertAdmins(ctx, deps, i, i.alert_count + 1, now);
  return due.map((i) => i.id);
}
