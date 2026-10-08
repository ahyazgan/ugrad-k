import { assert, assertEquals } from "jsr:@std/assert@1";
import { evaluateHealth, handleHealth, type HealthSnapshot } from "../_shared/health.ts";
import { handler } from "../_shared/http.ts";
import { fakeCtx } from "./fake.ts";

// deno-lint-ignore no-explicit-any
type Json = any;
const NOW = new Date("2026-10-10T12:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const healthy: HealthSnapshot = {
  checked_at: NOW.toISOString(),
  notifications_stuck: 0,
  notifications_failed_24h: 0,
  invoices_failed: 0,
  invoices_stuck: 0,
  webhooks_failed_24h: 0,
  webhooks_stuck: 0,
  orders_waiting: 0,
  orders_problem: 0,
  couriers_on_shift: 2,
  couriers_stale: 0,
  heartbeats: { "notify-dispatch": ago(1), "auto-dispatch": ago(1), "webhook-dispatch": ago(2), "invoice-dispatch": ago(3), "courier-earnings": ago(4) },
};
const env = (k: string) => ({ NOTIFY_SECRET: "s", ADMIN_ALERT_PHONES: "+905550000001" } as Record<string, string>)[k];
const cronReq = () => new Request("http://x", { method: "POST", headers: { "x-notify-secret": "s" } });

Deno.test("sağlık: sorunsuz özet sorun üretmez; geciken görev ve bekleyen sipariş kritik", () => {
  assertEquals(evaluateHealth(healthy, NOW), []);
  const bad = { ...healthy, orders_waiting: 2, invoices_failed: 1, heartbeats: { ...healthy.heartbeats, "notify-dispatch": ago(12) } };
  delete (bad.heartbeats as Json)["auto-dispatch"];
  const issues = evaluateHealth(bad, NOW);
  assertEquals(issues.map((i) => i.key).sort(), ["invoices_failed", "job:auto-dispatch", "job:notify-dispatch", "orders_waiting"]);
  assertEquals(issues.find((i) => i.key === "job:notify-dispatch")!.severity, "critical");
  assert(issues.find((i) => i.key === "job:auto-dispatch")!.message.includes("hiç çalışmadı"));
});

Deno.test("sağlık: kesinti izleyicisi ayrıntı görmez", async () => {
  const ok = fakeCtx({ userId: null, tables: { "rpc:system_health": healthy } });
  const r = await handler((q) => handleHealth(q, ok.ctx, { env, now: () => NOW }))(new Request("http://x"));
  assertEquals(await r.json(), { status: "ok" });
  const degraded = fakeCtx({ userId: null, tables: { "rpc:system_health": { ...healthy, orders_waiting: 1 } } });
  const d = await handler((q) => handleHealth(q, degraded.ctx, { env, now: () => NOW }))(new Request("http://x"));
  assertEquals((await d.json()).status, "degraded");
  const down = fakeCtx({ userId: null, tables: { "rpc:system_health": null } });
  assertEquals((await handler((q) => handleHealth(q, down.ctx, { env, now: () => NOW }))(new Request("http://x"))).status, 503);
});

Deno.test("sağlık: yeni sorun bir kez bildirilir, düzelince kapatılır", async () => {
  // 1) Yeni sorun → uyarı kaydı açılır
  const a = fakeCtx({ tables: { "rpc:system_health": { ...healthy, orders_waiting: 3 }, system_alerts: [] } });
  const r1 = await (await handler((q) => handleHealth(q, a.ctx, { env, now: () => NOW }))(cronReq())).json();
  assertEquals(r1.notified, 1);
  assertEquals(a.inserted.system_alerts![0]!.key, "orders_waiting");
  assert(a.rpcCalls.some((c) => c.name === "record_heartbeat" && c.args.p_name === "health"));

  // 2) Aynı sorun 1 saat sonra → tekrar mesaj yok
  const b = fakeCtx({
    tables: {
      "rpc:system_health": { ...healthy, orders_waiting: 3 },
      system_alerts: [{ key: "orders_waiting", message: "x", last_alerted_at: ago(60), resolved_at: null }],
    },
  });
  assertEquals((await (await handler((q) => handleHealth(q, b.ctx, { env, now: () => NOW }))(cronReq())).json()).notified, 0);

  // 3) Sorun düzeldi → kapatılır ve bildirilir
  const c = fakeCtx({
    tables: { "rpc:system_health": healthy, system_alerts: [{ key: "orders_waiting", message: "3 sipariş bekliyor", last_alerted_at: ago(60), resolved_at: null }] },
  });
  const r3 = await (await handler((q) => handleHealth(q, c.ctx, { env, now: () => NOW }))(cronReq())).json();
  assertEquals(r3.notified, 1);
  assertEquals(c.updated.system_alerts![0]!.resolved_at, NOW.toISOString());
});
