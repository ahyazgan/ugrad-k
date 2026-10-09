import { assertEquals } from "jsr:@std/assert@1";
import { handleAutoDispatch } from "../_shared/auto-dispatch.ts";
import { handler } from "../_shared/http.ts";
import { fakeCtx } from "./fake.ts";

// deno-lint-ignore no-explicit-any
type Json = any;
const NOW = new Date("2026-10-09T09:00:00Z");
const fresh = new Date(NOW.getTime() - 60_000).toISOString();
const ops = {
  id: 1,
  auto_approve: true,
  auto_assign: true,
  max_active_orders_per_courier: 3,
  max_pickup_distance_km: "15",
  location_max_age_minutes: 10,
  unassigned_alert_minutes: 10,
};
const cron = () => new Request("http://x", { method: "POST", headers: { "x-notify-secret": "s" } });
const env = (k: string) => ({ NOTIFY_SECRET: "s", ADMIN_ALERT_PHONES: "+905550000001" })[k];

function setup(over: Record<string, Json> = {}) {
  const assigned: Json[] = [];
  const tables: Record<string, Json> = {
    ops_settings: [ops],
    couriers: [
      { id: "k1", active: true, is_on_shift: true, last_lat: 41.12, last_lng: 29.1, last_location_at: fresh, profile: { full_name: "Mehmet" } },
      { id: "k2", active: true, is_on_shift: true, last_lat: 40.98, last_lng: 28.87, last_location_at: fresh, profile: { full_name: "Uzak" } },
    ],
    orders: [
      { id: "o1", order_no: "YK-1", status: "onaylandi", pickup_lat: 41.1295, pickup_lng: 29.1135, urgent: false, created_at: "2026-10-09T08:58:00Z", scheduled_pickup_at: null, payment_method: "nakit", payment_status: "odenmedi" },
    ],
    order_status_history: [],
    "rpc:auto_approve_orders": 2,
    "rpc:system_assign_courier": (args: Json) => {
      assigned.push(args);
      return true;
    },
    ...over,
  };
  const f = fakeCtx({ userId: null, tables });
  return { ...f, assigned };
}

Deno.test("auto-dispatch: gizli anahtar yoksa 401", async () => {
  const { ctx } = setup();
  const res = await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW }))(new Request("http://x", { method: "POST" }));
  assertEquals(res.status, 401);
});

Deno.test("auto-dispatch: onaylar ve en yakın kuryeye atar", async () => {
  const { ctx, assigned } = setup();
  const data = await (await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW }))(cron())).json();
  assertEquals(data.approved, 2);
  assertEquals(data.assigned.length, 1);
  assertEquals(assigned[0].p_courier_id, "k1");
  assertEquals(String(assigned[0].p_note).startsWith("Otomatik atama ("), true);
});

Deno.test("auto-dispatch: işi bırakan kuryeye tekrar verilmez; ödenmemiş kart atanmaz", async () => {
  const { ctx, assigned } = setup({
    orders: [
      { id: "o1", order_no: "YK-1", status: "onaylandi", pickup_lat: 41.1295, pickup_lng: 29.1135, urgent: false, created_at: "2026-10-09T08:58:00Z", scheduled_pickup_at: null, payment_method: "nakit", payment_status: "odenmedi" },
      { id: "o2", order_no: "YK-2", status: "onaylandi", pickup_lat: 41.1295, pickup_lng: 29.1135, urgent: true, created_at: "2026-10-09T08:58:00Z", scheduled_pickup_at: null, payment_method: "kart", payment_status: "odenmedi" },
    ],
    order_status_history: [{ order_id: "o1", changed_by: "k1", from_status: "kuryeye_atandi", to_status: "onaylandi" }],
  });
  const data = await (await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW }))(cron())).json();
  assertEquals(assigned.length, 0); // k1 bıraktı, k2 çok uzak
  assertEquals(data.unassigned, ["o1"]);
});

Deno.test("auto-dispatch: teklifi reddeden kuryeye verilmez, süresi dolan 10 dk sonra tekrar alabilir", async () => {
  const declined = setup({
    courier_offers: [{ order_id: "o1", courier_id: "k1", response: "ret", responded_at: "2026-10-09T07:00:00Z" }],
  });
  const d1 = await (await handler((r) => handleAutoDispatch(r, declined.ctx, { env, now: NOW }))(cron())).json();
  assertEquals(d1.assigned.length, 0);

  const timedOutRecently = setup({
    courier_offers: [{ order_id: "o1", courier_id: "k1", response: "zaman_asimi", responded_at: "2026-10-09T08:55:00Z" }],
  });
  await handler((r) => handleAutoDispatch(r, timedOutRecently.ctx, { env, now: NOW }))(cron());
  assertEquals(timedOutRecently.assigned.length, 0);

  const timedOutLongAgo = setup({
    courier_offers: [{ order_id: "o1", courier_id: "k1", response: "zaman_asimi", responded_at: "2026-10-09T08:45:00Z" }],
  });
  await handler((r) => handleAutoDispatch(r, timedOutLongAgo.ctx, { env, now: NOW }))(cron());
  assertEquals(timedOutLongAgo.assigned[0].p_courier_id, "k1");
});

Deno.test("auto-dispatch: süresi dolan teklifler her çalışmada geri alınır", async () => {
  const { ctx } = setup({ "rpc:expire_offers": 2, ops_settings: [{ ...ops, auto_assign: false }] });
  const data = await (await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW }))(cron())).json();
  assertEquals(data.expiredOffers, 2);
});

Deno.test("auto-dispatch: moladaki kuryeye iş verilmez", async () => {
  const { ctx, assigned } = setup({
    couriers: [{ id: "k1", active: true, is_on_shift: true, on_break: true, last_lat: 41.12, last_lng: 29.1, last_location_at: fresh, profile: { full_name: "Mehmet" } }],
  });
  const data = await (await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW }))(cron())).json();
  assertEquals(assigned.length, 0);
  assertEquals(data.unassigned, ["o1"]);
});

Deno.test("auto-dispatch: yanıtsız kurye molaya alınınca haberdar edilir; uzun mola yöneticiye bir kez", async () => {
  const sent: string[] = [];
  const fetchFn = ((url: string, init?: RequestInit) => {
    sent.push(`${url} ${init?.body ?? ""}`);
    return Promise.resolve(Response.json({ data: [{ status: "ok" }] }));
  }) as unknown as typeof fetch;
  const { ctx, updated } = setup({
    ops_settings: [{ ...ops, auto_assign: false, offer_auto_break_after: 3, max_break_minutes: 45 }],
    "rpc:auto_break_unresponsive": ["k1"],
    profiles: [{ id: "k1", phone: "+905551110001", push_token: "ExponentPushToken[k1]" }],
    courier_breaks: [{ id: "b1", courier_id: "k2", started_at: "2026-10-09T08:00:00Z", ended_at: null, alerted_at: null, courier: { profile: { full_name: "Uzun Molacı" } } }],
  });
  const data = await (await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW, fetchFn }))(cron())).json();
  assertEquals(data.autoBreaks, ["k1"]);
  assertEquals(sent.some((x) => x.includes("exp.host") && x.includes("molaya alındınız")), true);
  assertEquals(data.breakAlerts, ["b1"]);
  assertEquals(typeof updated.courier_breaks![0]!.alerted_at, "string");
  // İkinci çalıştırmada tekrar uyarı yok
  const again = await (await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW, fetchFn }))(cron())).json();
  assertEquals(again.breakAlerts, []);
});

Deno.test("auto-dispatch: vardiya hatırlatma ve gelmedi bildirimi bir kez", async () => {
  const sent: string[] = [];
  const fetchFn = ((url: string, init?: RequestInit) => {
    sent.push(`${url} ${init?.body ?? ""}`);
    return Promise.resolve(Response.json({ data: [{ status: "ok" }] }));
  }) as unknown as typeof fetch;
  const { ctx, updated } = setup({
    ops_settings: [{ ...ops, auto_assign: false }],
    "rpc:shift_reminders_due": [{ id: "b1", courier_id: "k1", starts_at: "2026-10-09T10:00:00Z", ends_at: "2026-10-09T14:00:00Z" }],
    "rpc:shift_no_shows_due": [{ id: "b2", courier_id: "k2", starts_at: "2026-10-09T05:00:00Z", ends_at: "2026-10-09T09:00:00Z" }],
    profiles: [
      { id: "k1", full_name: "Mehmet", phone: "+905551110001", push_token: "ExponentPushToken[k1]" },
      { id: "k2", full_name: "Emre", phone: "+905551110002", push_token: "ExponentPushToken[k2]" },
    ],
    shift_bookings: [{ id: "b1" }, { id: "b2" }],
  });
  const data = await (await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW, fetchFn }))(cron())).json();
  assertEquals(data.shiftReminders, ["b1"]);
  assertEquals(data.shiftNoShows, ["b2"]);
  assertEquals(sent.some((x) => x.includes("13:00–17:00")), true); // İstanbul saati
  assertEquals(updated.shift_bookings!.map((b) => Object.keys(b).sort().join()), ["id,reminded_at", "id,no_show_alerted_at"]);
});

Deno.test("auto-dispatch: performansı yüksek kurye biraz uzakta da olsa önce", async () => {
  const stats = (id: string, accepted: number, offered: number, rating: number) => ({
    courier_id: id, offers_accepted: accepted, offers_declined: offered - accepted, offers_timed_out: 0, delivered: 30, urgent_delivered: 0,
    urgent_on_time: 0, rating_count: 10, rating_avg: rating, released: 0, failed_deliveries: 0, shifts_booked: 0, shifts_attended: 0, late_cancels: 0,
  });
  const { ctx, assigned } = setup({
    couriers: [
      { id: "zayif", active: true, is_on_shift: true, last_lat: 41.12, last_lng: 29.1, last_location_at: fresh, profile: { full_name: "Yakın" } },
      { id: "iyi", active: true, is_on_shift: true, last_lat: 41.14, last_lng: 29.13, last_location_at: fresh, profile: { full_name: "İyi" } },
    ],
    "rpc:courier_performance_stats": [stats("zayif", 4, 10, 2.5), stats("iyi", 20, 20, 4.9)],
  });
  await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW }))(cron());
  assertEquals(assigned[0].p_courier_id, "iyi");
});

Deno.test("auto-dispatch: uzun süredir atanamayan için yöneticiye bir kez uyarı", async () => {
  const old = { id: "o1", order_no: "YK-1", status: "onaylandi", pickup_lat: 41.1295, pickup_lng: 29.1135, urgent: false, created_at: "2026-10-09T08:40:00Z", scheduled_pickup_at: null, payment_method: "nakit", payment_status: "odenmedi" };
  const { ctx, updated } = setup({ couriers: [], orders: [old] });
  const data = await (await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW }))(cron())).json();
  assertEquals(data.alerted, ["o1"]);
  assertEquals(typeof updated.orders![0]!.unassigned_alerted_at, "string");
  // İkinci çalıştırmada tekrar uyarı yok
  const again = await (await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW }))(cron())).json();
  assertEquals(again.alerted, []);
});

Deno.test("auto-dispatch: otomatik atama kapalıyken yalnız onay", async () => {
  const { ctx, assigned } = setup({ ops_settings: [{ ...ops, auto_assign: false }] });
  const data = await (await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW }))(cron())).json();
  assertEquals(data.approved, 2);
  assertEquals(assigned.length, 0);
});

Deno.test("auto-dispatch: zorunlu belgesi süresi dolan kuryeye iş verilmez", async () => {
  const docs = (courier: string, sigorta: string) => [
    { courier_id: courier, kind: "ehliyet", expires_at: "2035-01-01" },
    { courier_id: courier, kind: "kurye_faaliyet_belgesi", expires_at: "2030-01-01" },
    { courier_id: courier, kind: "ruhsat", expires_at: null },
    { courier_id: courier, kind: "trafik_sigortasi", expires_at: sigorta },
  ];
  const expired = setup({ ops_settings: [{ ...ops, enforce_courier_documents: true }], courier_documents: docs("k1", "2026-10-08") });
  const d1 = await (await handler((r) => handleAutoDispatch(r, expired.ctx, { env, now: NOW }))(cron())).json();
  assertEquals(d1.assigned.length, 0);
  assertEquals(expired.assigned.length, 0);

  const valid = setup({ ops_settings: [{ ...ops, enforce_courier_documents: true }], courier_documents: docs("k1", "2026-10-09") });
  await handler((r) => handleAutoDispatch(r, valid.ctx, { env, now: NOW }))(cron());
  assertEquals(valid.assigned[0].p_courier_id, "k1");
});

Deno.test("auto-dispatch: acil siparişte taahhüt riski bir kez bildirilir", async () => {
  const urgent = {
    id: "u9",
    order_no: "YK-9",
    status: "yolda",
    sla_due_at: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
    sla_alerted_at: null,
    pickup_lat: 41.1295,
    pickup_lng: 29.1135,
    dropoff_lat: 41.0821,
    dropoff_lng: 29.0106,
    duration_seconds: 1800,
    tracking_token: "t".repeat(32),
    price_quote: { lines: [{ code: "urgent", label: "Acil", amountKurus: 20_000 }] },
    payment_method: "nakit",
    payment_status: "odenmedi",
    customer: { phone: "+905321112233", push_token: null },
    // Kurye hâlâ Beykoz'da: 5 dakikada Levent'e yetişemez
    courier: { last_lat: 41.1295, last_lng: 29.1135, last_location_at: fresh },
  };
  const onTime = { ...urgent, id: "u10", order_no: "YK-10", sla_due_at: new Date(NOW.getTime() + 90 * 60_000).toISOString() };
  const { ctx, updated } = setup({ ops_settings: [{ ...ops, auto_assign: false }], orders: [urgent, onTime] });
  const data = await (await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW }))(cron())).json();
  assertEquals(data.slaAlerted, ["u9"]);
  assertEquals(updated.orders!.find((o: Json) => o.id === "u9")!.sla_alerted_at, NOW.toISOString());
  // İkinci çalıştırmada tekrar bildirilmez
  const again = await (await handler((r) => handleAutoDispatch(r, ctx, { env, now: NOW }))(cron())).json();
  assertEquals(again.slaAlerted, []);
});
