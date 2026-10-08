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
