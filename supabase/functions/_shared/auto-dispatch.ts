// Otomatik onay + kurye atama + atanamayan sipariş uyarısı.
// Her dakika pg_cron ile (x-notify-secret) veya panelden yönetici tarafından tetiklenir.
import {
  courierCompliance,
  courierPerformance,
  excludedCouriers,
  performanceStatsFromRow,
  planAssignments,
  slotLabel,
  type AssignableOrder,
  type CandidateCourier,
} from "../../../packages/shared/index.ts";
import { deliver, type Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { notificationConfig } from "./dispatch.ts";
import { HttpError, json } from "./http.ts";
import { checkUrgentSla } from "./sla.ts";
import { resendUnacknowledgedSos } from "./sos.ts";

const ACTIVE = ["kuryeye_atandi", "alindi", "yolda"];
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

export async function handleAutoDispatch(
  req: Request,
  ctx: Ctx,
  deps: { env: Env; fetchFn?: typeof fetch; now?: Date },
): Promise<Response> {
  const trigger = await authorize(req, ctx, deps.env);
  if (trigger === "cron") await ctx.admin.rpc("record_heartbeat", { p_name: "auto-dispatch" });
  const now = deps.now ?? new Date();

  const { data: ops } = await ctx.admin.from("ops_settings").select("*").eq("id", 1).single();
  if (!ops) throw new Error("Operasyon ayarları okunamadı");

  const { data: approved } = await ctx.admin.rpc("auto_approve_orders");
  const summary = {
    trigger,
    approved: Number(approved ?? 0),
    assigned: [] as Row[],
    unassigned: [] as string[],
    alerted: [] as string[],
    slaAlerted: [] as string[],
    expiredOffers: 0,
    autoBreaks: [] as string[],
    breakAlerts: [] as string[],
    sosResent: [] as string[],
    shiftReminders: [] as string[],
    shiftNoShows: [] as string[],
  };
  // Süresi dolan teklifler havuza döner (otomatik atama kapalı olsa da)
  const { data: expired } = await ctx.admin.rpc("expire_offers");
  summary.expiredOffers = Number(expired ?? 0);
  summary.autoBreaks = await autoBreakUnresponsive(ctx, deps, ops);
  summary.breakAlerts = await alertLongBreaks(ctx, deps, ops, now);
  summary.sosResent = await resendUnacknowledgedSos(ctx, deps, now);
  Object.assign(summary, await shiftNotices(ctx, deps, now));
  // Saklama süresi dolan yazışmalar (90 gün)
  await ctx.admin.rpc("purge_old_messages");
  if (!ops.auto_assign) {
    summary.slaAlerted = await checkUrgentSla(ctx, deps, now);
    return json(summary);
  }

  const [couriersRes, activeRes, ordersRes] = await Promise.all([
    ctx.admin
      .from("couriers")
      .select("id, last_lat, last_lng, last_location_at, on_break, profile:profiles(full_name)")
      .eq("active", true)
      .eq("is_on_shift", true),
    ctx.admin.from("orders").select("courier_id").in("status", ACTIVE),
    ctx.admin
      .from("orders")
      .select("id, order_no, pickup_lat, pickup_lng, urgent, service_level, created_at, scheduled_pickup_at, payment_method, payment_status, unassigned_alerted_at")
      .eq("status", "onaylandi"),
  ]);

  const load = new Map<string, number>();
  for (const r of (activeRes.data ?? []) as Row[]) if (r.courier_id) load.set(r.courier_id, (load.get(r.courier_id) ?? 0) + 1);
  let onShift = (couriersRes.data ?? []) as Row[];
  // Vardiya sırasında süresi dolan zorunlu belge: yeni iş verilmez
  if (ops.enforce_courier_documents && onShift.length) {
    const { data: docs } = await ctx.admin
      .from("courier_documents")
      .select("courier_id, kind, expires_at")
      .in("courier_id", onShift.map((c) => c.id));
    const byCourier = new Map<string, Row[]>();
    for (const d of (docs ?? []) as Row[]) byCourier.set(d.courier_id, [...(byCourier.get(d.courier_id) ?? []), d]);
    onShift = onShift.filter((c) =>
      courierCompliance((byCourier.get(c.id) ?? []).map((d) => ({ kind: d.kind, expiresAt: d.expires_at })), now).ok,
    );
  }
  // Performans puanı (son 30 gün): yalnız atanacak iş varken hesaplanır
  const performance = new Map<string, number | null>();
  const hasWork = ((ordersRes.data ?? []) as Row[]).length > 0;
  if (hasWork && onShift.length) {
    const { data: stats } = await ctx.admin.rpc("courier_performance_stats", { p_days: 30 });
    for (const r of (stats ?? []) as Row[]) performance.set(r.courier_id, courierPerformance(performanceStatsFromRow(r)).score);
  }
  const couriers: CandidateCourier[] = onShift.map((c) => ({
    id: c.id,
    name: c.profile?.full_name ?? null,
    lat: c.last_lat,
    lng: c.last_lng,
    locationAt: c.last_location_at,
    activeOrders: load.get(c.id) ?? 0,
    onBreak: !!c.on_break,
    performance: performance.get(c.id) ?? null,
  }));

  // Kartla ödenmemişler atanmaz
  const rows = ((ordersRes.data ?? []) as Row[]).filter((o) => o.payment_method !== "kart" || o.payment_status === "odendi");
  const ids = rows.map((o) => o.id);
  let declined = new Map<string, string[]>();
  if (ids.length) {
    const [{ data: hist }, { data: offers }] = await Promise.all([
      ctx.admin
        .from("order_status_history")
        .select("order_id, changed_by")
        .in("order_id", ids)
        .eq("from_status", "kuryeye_atandi")
        .eq("to_status", "onaylandi"),
      ctx.admin.from("courier_offers").select("order_id, courier_id, response, responded_at").in("order_id", ids),
    ]);
    // Teklifi reddeden (kalıcı) ve süresi dolan (10 dk) kuryeler
    declined = excludedCouriers(
      ((offers ?? []) as Row[]).map((r) => ({ orderId: r.order_id, courierId: r.courier_id, response: r.response, respondedAt: r.responded_at })),
      now,
    );
    // İşi kabul edip sonra bırakan kuryeler
    for (const h of (hist ?? []) as Row[]) {
      if (h.changed_by) declined.set(h.order_id, [...new Set([...(declined.get(h.order_id) ?? []), h.changed_by])]);
    }
  }
  const orders: AssignableOrder[] = rows.map((o) => ({
    id: o.id,
    pickupLat: o.pickup_lat,
    pickupLng: o.pickup_lng,
    urgent: o.urgent,
    serviceLevel: o.service_level ?? undefined,
    createdAt: o.created_at,
    scheduledPickupAt: o.scheduled_pickup_at,
    declinedBy: declined.get(o.id) ?? [],
  }));

  const plan = planAssignments(orders, couriers, {
    maxActiveOrdersPerCourier: ops.max_active_orders_per_courier,
    maxPickupDistanceKm: Number(ops.max_pickup_distance_km),
    locationMaxAgeMinutes: ops.location_max_age_minutes,
    now,
  });

  for (const a of plan.assignments) {
    const note = `Otomatik atama (${a.distanceKm.toLocaleString("tr-TR")} km)`;
    const { data: ok } = await ctx.admin.rpc("system_assign_courier", { p_order_id: a.orderId, p_courier_id: a.courierId, p_note: note });
    if (ok === true) summary.assigned.push(a);
    else summary.unassigned.push(a.orderId);
  }
  summary.unassigned.push(...plan.unassigned);

  // Uzun süredir atanamayan siparişler için yöneticiye bir kez uyarı
  const cfg = notificationConfig(deps.env);
  const threshold = now.getTime() - ops.unassigned_alert_minutes * 60_000;
  for (const id of summary.unassigned) {
    const o = rows.find((r) => r.id === id);
    if (!o || o.unassigned_alerted_at || new Date(o.created_at).getTime() > threshold) continue;
    await Promise.all(
      cfg.adminPhones.map((phone) =>
        deliver(
          {
            to: { role: "admin", phone },
            channels: ["whatsapp", "sms"],
            title: "Kurye atanamadı",
            text: `${o.order_no}${o.urgent ? " (ACİL)" : ""} ${ops.unassigned_alert_minutes} dakikadır kurye bekliyor; uygun kurye yok.`,
            whatsappTemplate: { name: "yonetici_uyari", params: [`${o.order_no} kurye bekliyor`] },
          },
          { env: deps.env, fetchFn: deps.fetchFn },
        ),
      ),
    );
    await ctx.admin.from("orders").update({ unassigned_alerted_at: now.toISOString() }).eq("id", id);
    summary.alerted.push(id);
  }
  summary.slaAlerted = await checkUrgentSla(ctx, deps, now);
  return json(summary);
}

/** Üst üste yanıtsız teklif bırakan kuryeleri molaya alır ve kuryeye haber verir */
async function autoBreakUnresponsive(ctx: Ctx, deps: { env: Env; fetchFn?: typeof fetch }, ops: Row): Promise<string[]> {
  const { data } = await ctx.admin.rpc("auto_break_unresponsive");
  const ids = ((data ?? []) as unknown[]).map((x) => (typeof x === "string" ? x : (x as Row).auto_break_unresponsive as string));
  if (!ids.length) return [];
  const { data: profiles } = await ctx.admin.from("profiles").select("id, phone, push_token").in("id", ids);
  await Promise.all(
    ((profiles ?? []) as Row[]).map((p) =>
      deliver(
        {
          to: { role: "courier", phone: p.phone, pushToken: p.push_token },
          channels: ["push", "sms"],
          title: "Molaya alındınız",
          text: `Üst üste ${ops.offer_auto_break_after} iş teklifine yanıt vermediğiniz için molaya alındınız. Hazır olduğunuzda uygulamada "Moladan dön"e basın.`,
        },
        { env: deps.env, fetchFn: deps.fetchFn },
      ),
    ),
  );
  return ids;
}

/** İzin verilenden uzun süren molalar için yöneticiye bir kez uyarı */
async function alertLongBreaks(ctx: Ctx, deps: { env: Env; fetchFn?: typeof fetch }, ops: Row, now: Date): Promise<string[]> {
  const limit = Number(ops.max_break_minutes ?? 45);
  const { data } = await ctx.admin
    .from("courier_breaks")
    .select("id, courier_id, started_at, courier:couriers(profile:profiles(full_name))")
    .is("ended_at", null)
    .is("alerted_at", null)
    .lt("started_at", new Date(now.getTime() - limit * 60_000).toISOString());
  const rows = (data ?? []) as Row[];
  if (!rows.length) return [];
  const cfg = notificationConfig(deps.env);
  for (const b of rows) {
    const minutes = Math.floor((now.getTime() - new Date(b.started_at).getTime()) / 60_000);
    const text = `${b.courier?.profile?.full_name ?? "Kurye"} ${minutes} dakikadır molada (sınır ${limit} dk).`;
    await Promise.all(
      cfg.adminPhones.map((phone) =>
        deliver(
          { to: { role: "admin", phone }, channels: ["whatsapp", "sms"], title: "Uzun mola", text, whatsappTemplate: { name: "yonetici_uyari", params: [text] } },
          { env: deps.env, fetchFn: deps.fetchFn },
        ),
      ),
    );
    await ctx.admin.from("courier_breaks").update({ alerted_at: now.toISOString() }).eq("id", b.id);
  }
  return rows.map((b) => b.id);
}

/** Vardiya planı: 60 dk önce hatırlatma; başlangıçtan 15 dk sonra vardiya açılmadıysa kuryeye ve yöneticiye */
async function shiftNotices(ctx: Ctx, deps: { env: Env; fetchFn?: typeof fetch }, now: Date) {
  const [{ data: reminders }, { data: noShows }] = await Promise.all([
    ctx.admin.rpc("shift_reminders_due"),
    ctx.admin.rpc("shift_no_shows_due"),
  ]);
  const due = [...((reminders ?? []) as Row[]), ...((noShows ?? []) as Row[])];
  const result = { shiftReminders: [] as string[], shiftNoShows: [] as string[] };
  if (!due.length) return result;
  const { data: profiles } = await ctx.admin.from("profiles").select("id, full_name, phone, push_token").in("id", [...new Set(due.map((b) => b.courier_id))]);
  const who = new Map(((profiles ?? []) as Row[]).map((p) => [p.id, p]));
  const opts = { env: deps.env, fetchFn: deps.fetchFn };
  const cfg = notificationConfig(deps.env);
  for (const b of (reminders ?? []) as Row[]) {
    const p = who.get(b.courier_id);
    await deliver(
      {
        to: { role: "courier", phone: p?.phone, pushToken: p?.push_token },
        channels: ["push", "sms"],
        title: "Vardiya hatırlatma",
        text: `Vardiyanız ${slotLabel(b.starts_at, b.ends_at)} arası. Başlayınca uygulamadan "Vardiyayı başlat"a basın.`,
      },
      opts,
    );
    await ctx.admin.from("shift_bookings").update({ reminded_at: now.toISOString() }).eq("id", b.id);
    result.shiftReminders.push(b.id);
  }
  for (const b of (noShows ?? []) as Row[]) {
    const p = who.get(b.courier_id);
    const slot = slotLabel(b.starts_at, b.ends_at);
    await deliver(
      {
        to: { role: "courier", phone: p?.phone, pushToken: p?.push_token },
        channels: ["push", "sms"],
        title: "Vardiyanız başladı",
        text: `${slot} vardiyanız başladı ama vardiyayı açmadınız. Gelemiyorsanız yöneticinize haber verin.`,
      },
      opts,
    );
    const text = `${p?.full_name ?? "Kurye"} ${slot} vardiyasını açmadı (planlıydı).`;
    await Promise.all(
      cfg.adminPhones.map((phone) =>
        deliver({ to: { role: "admin", phone }, channels: ["whatsapp", "sms"], title: "Vardiyaya gelmedi", text, whatsappTemplate: { name: "yonetici_uyari", params: [text] } }, opts),
      ),
    );
    await ctx.admin.from("shift_bookings").update({ no_show_alerted_at: now.toISOString() }).eq("id", b.id);
    result.shiftNoShows.push(b.id);
  }
  return result;
}
