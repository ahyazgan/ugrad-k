import { assertEquals } from "jsr:@std/assert@1";
import { handler } from "../_shared/http.ts";
import { handleSos, resendUnacknowledgedSos } from "../_shared/sos.ts";
import { fakeCtx } from "./fake.ts";

// deno-lint-ignore no-explicit-any
type Json = any;
const NOW = new Date("2026-10-12T10:00:00Z");
const env = (k: string) => ({ ADMIN_ALERT_PHONES: "+905550000001", NETGSM_USERCODE: "u", NETGSM_PASSWORD: "p", NETGSM_HEADER: "H" })[k];
const post = (body: Json) => new Request("http://x", { method: "POST", headers: { Authorization: "Bearer t" }, body: JSON.stringify(body) });

function setup(over: Record<string, Json> = {}) {
  const sent: string[] = [];
  const fetchFn = ((url: string, init?: RequestInit) => {
    sent.push(`${url} ${typeof init?.body === "string" ? init.body : ""}`);
    return Promise.resolve(Response.json({ code: "00", jobid: "1" }));
  }) as unknown as typeof fetch;
  const f = fakeCtx({
    userId: "k1",
    tables: {
      profiles: [
        { id: "k1", role: "kurye", full_name: "Mehmet Kaya", phone: "+905551110001" },
        { id: "m1", role: "musteri" },
      ],
      orders: [{ id: "o1", order_no: "YK-1042" }],
      courier_incidents: [],
      "rpc:raise_sos": (a: Json) => ({ id: "i1", courier_id: a.p_courier_id, kind: a.p_kind, lat: a.p_lat, lng: a.p_lng, accuracy_m: a.p_accuracy, note: a.p_note, order_id: "o1", alert_count: 0, created_at: NOW.toISOString() }),
      ...over,
    },
  });
  return { ...f, sent, fetchFn };
}

Deno.test("sos: yalnız kurye; tür doğrulanır", async () => {
  const notCourier = fakeCtx({ userId: "m1", tables: { profiles: [{ id: "m1", role: "musteri" }] } });
  const r1 = await handler((r) => handleSos(r, notCourier.ctx, { env }))(post({ kind: "kaza" }));
  assertEquals(r1.status, 403);
  const { ctx } = setup();
  const r2 = await handler((r) => handleSos(r, ctx, { env }))(post({ kind: "yangin" }));
  assertEquals(r2.status, 400);
});

Deno.test("sos: alarm kaydedilir, yöneticiye konumlu mesaj gider", async () => {
  const { ctx, sent, fetchFn, rpcCalls } = setup();
  const res = await handler((r) => handleSos(r, ctx, { env, fetchFn, now: NOW }))(post({ kind: "kaza", lat: 41.1, lng: 29.05, accuracy: 9, note: "Düştüm" }));
  const data = await res.json();
  assertEquals(res.status, 200);
  assertEquals(data.alerted, 1);
  assertEquals(rpcCalls.find((c) => c.name === "raise_sos")!.args.p_courier_id, "k1");
  const msg = decodeURIComponent(sent.join(" "));
  assertEquals(msg.includes("Mehmet Kaya"), true);
  assertEquals(msg.includes("YK-1042"), true);
});

Deno.test("sos: 2 dk içindeki tekrar basış yeniden göndermez", async () => {
  const { ctx, sent, fetchFn } = setup({ "rpc:raise_sos": { id: "i1", courier_id: "k1", kind: "kaza", alert_count: 1, created_at: NOW.toISOString() } });
  const data = await (await handler((r) => handleSos(r, ctx, { env, fetchFn, now: NOW }))(post({ kind: "kaza" }))).json();
  assertEquals(data.alerted, 0);
  assertEquals(sent.length, 0);
});

Deno.test("sos: görülmeyen alarm 5 dk sonra yeniden, en fazla 3 kez", async () => {
  const at = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
  const { ctx, updated, fetchFn } = setup({
    courier_incidents: [
      { id: "eski", courier_id: "k1", kind: "tehlike", alert_count: 1, last_alert_at: at(6), resolved_at: null, acknowledged_at: null },
      { id: "yeni", courier_id: "k1", kind: "tehlike", alert_count: 1, last_alert_at: at(2), resolved_at: null, acknowledged_at: null },
      { id: "bitti", courier_id: "k1", kind: "tehlike", alert_count: 3, last_alert_at: at(20), resolved_at: null, acknowledged_at: null },
      { id: "goruldu", courier_id: "k1", kind: "tehlike", alert_count: 1, last_alert_at: at(20), resolved_at: null, acknowledged_at: at(10) },
    ],
  });
  const ids = await resendUnacknowledgedSos(ctx, { env, fetchFn }, NOW);
  assertEquals(ids, ["eski"]);
  assertEquals(updated.courier_incidents!.at(-1)!.alert_count, 2);
});
