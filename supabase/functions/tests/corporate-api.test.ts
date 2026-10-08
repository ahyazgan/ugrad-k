import { assert, assertEquals } from "jsr:@std/assert@1";
import { handleCorporateApi, sha256Hex } from "../_shared/corporate-api.ts";
import { handler } from "../_shared/http.ts";
import { hmacSha256Hex } from "../_shared/iyzico.ts";
import { handleWebhookDispatch, retryDelayMs, WEBHOOK_MAX_ATTEMPTS } from "../_shared/webhooks.ts";
import { fakeCtx } from "./fake.ts";

// deno-lint-ignore no-explicit-any
type Json = any;
const KEY = "yk_live_testanahtar123";
const env = (k: string) => ({ NOTIFY_SECRET: "s3cret", PUBLIC_TRACKING_BASE_URL: "https://panel.ornek.com/takip" } as Record<string, string>)[k];
const ORDER_ID = "11111111-1111-1111-1111-111111111111";

async function setup(extra: Record<string, Json> = {}) {
  const tables: Record<string, Json> = {
    api_keys: [
      { id: "k1", corporate_account_id: "acc1", profile_id: "c1", key_hash: await sha256Hex(KEY), revoked_at: null },
      { id: "k2", corporate_account_id: "acc1", profile_id: "c1", key_hash: await sha256Hex("yk_live_iptal"), revoked_at: "2026-01-01" },
    ],
    corporate_accounts: [{ id: "acc1", company_name: "API AŞ" }],
    profiles: [{ id: "c1", role: "musteri", corporate_account_id: "acc1" }],
    current_consents: [
      { profile_id: "c1", consent_type: "kvkk_aydinlatma", granted: true },
      { profile_id: "c1", consent_type: "acik_riza_konum", granted: true },
    ],
    orders: [],
    ...extra,
  };
  const f = fakeCtx({ userId: null, tables });
  const call = (method: string, path: string, body?: unknown, key: string | null = KEY) =>
    handler((r) => handleCorporateApi(r, f.ctx, { env }))(
      new Request(`http://x/api${path}`, {
        method,
        headers: key ? { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } : {},
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return { ...f, tables, call };
}

const orderBody = {
  pickup: { address: "Kılıçlı Mah. Şile Cad. No: 8A, Beykoz", lat: 41.1295, lng: 29.1135, contactName: "Resepsiyon" },
  dropoff: { address: "Levent" },
  urgent: true,
  packageDescription: "Sözleşme",
  externalRef: "ERP-42",
};

Deno.test("api: anahtarsız veya iptal edilmiş anahtar 401", async () => {
  const { call } = await setup();
  assertEquals((await call("GET", "/v1/ping", undefined, null)).status, 401);
  assertEquals((await call("GET", "/v1/ping", undefined, "yk_live_iptal")).status, 401);
  assertEquals((await call("GET", "/v1/ping", undefined, "yk_live_yanlis")).status, 401);
  const ok = await call("GET", "/v1/ping");
  assertEquals((await ok.json()).account, "API AŞ");
});

Deno.test("api: yalnız adresle fiyat (adres harita servisinden çözülür)", async () => {
  const { call } = await setup();
  const res = await call("POST", "/v1/quotes", { pickup: { address: "Moda Cad." }, dropoff: { address: "Ataşehir" } });
  assertEquals(res.status, 200);
  assert((await res.json()).quote.totalKurus > 0);
  const bad = await call("POST", "/v1/quotes", { pickup: { address: "xx" }, dropoff: { address: "Ataşehir" } });
  assertEquals((await bad.json()).field, "pickup");
});

Deno.test("api: sipariş cari hesapla açılır, dış referans saklanır; tekrar gönderimde aynı sipariş döner", async () => {
  const { call, inserted, tables } = await setup();
  const res = await call("POST", "/v1/orders", orderBody);
  assertEquals(res.status, 201);
  const data = await res.json();
  assertEquals(data.order.externalRef, "ERP-42");
  assert(data.order.trackingUrl.startsWith("https://panel.ornek.com/takip/"));
  const row = inserted.orders![0]!;
  assertEquals(row.payment_method, "cari");
  assertEquals(row.payment_status, "cari_hesap");
  assertEquals(row.api_key_id, "k1");
  assertEquals(row.corporate_account_id, "acc1");
  assertEquals(row.urgent, true);
  // Aynı referans: yeni sipariş açılmaz
  tables.orders[0].external_ref = "ERP-42";
  const again = await call("POST", "/v1/orders", orderBody);
  assertEquals(again.status, 200);
  assertEquals((await again.json()).duplicate, true);
  assertEquals(inserted.orders!.length, 1);
});

Deno.test("api: başka hesabın siparişi 404, iptal kuralları", async () => {
  const order = { id: ORDER_ID, corporate_account_id: "acc1", status: "yolda", order_no: "YK-1", tracking_token: "t".repeat(32) };
  const { call, rpcCalls } = await setup({ orders: [order], "rpc:api_cancel_order": () => "not_cancellable" });
  assertEquals((await call("GET", "/v1/orders/22222222-2222-2222-2222-222222222222")).status, 404);
  const got = await call("GET", `/v1/orders/${ORDER_ID}`);
  assertEquals((await got.json()).order.statusLabel, "Yolda");
  const c = await call("POST", `/v1/orders/${ORDER_ID}/cancel`, { reason: "vazgeçtik" });
  assertEquals(c.status, 409);
  assertEquals(rpcCalls.find((x) => x.name === "api_cancel_order")!.args.p_corporate_account_id, "acc1");
  assertEquals((await call("GET", "/v1/bilinmeyen")).status, 404);
});

Deno.test("api: hız sınırı anahtar başına", async () => {
  const { call } = await setup({ "rpc:hit_rate_limit": (a: Json) => a.p_key !== "api:k1" });
  assertEquals((await call("GET", "/v1/ping")).status, 429);
});

// ───────── Webhook gönderici
function webhookSetup(attempts: number, hook: Json = { corporate_account_id: "acc1", url: "https://ornek.com/hook", secret: "whsec_abcdefghijklmnopqrstuvwx", active: true }) {
  const delivery = { id: 7, corporate_account_id: "acc1", event: "order.status_changed", payload: { event: "order.status_changed", occurred_at: "2026-10-10T09:59:00Z", order: { id: "o1", order_no: "YK-7", status: "yolda", previous_status: "alindi", tracking_token: "abc" } }, attempts };
  return fakeCtx({ tables: { "rpc:claim_webhook_deliveries": [delivery], corporate_webhooks: [hook], webhook_deliveries: [{ ...delivery }] } });
}
const dispatchReq = () => new Request("http://x", { method: "POST", headers: { "x-notify-secret": "s3cret" } });
const now = () => new Date("2026-10-10T10:00:00Z");

Deno.test("webhook: imzalı gönderim, 2xx teslim edildi", async () => {
  const f = webhookSetup(1);
  let seen: { headers: Headers; body: string } | null = null;
  const fetchFn = ((_u: string, init: RequestInit) => {
    seen = { headers: new Headers(init.headers), body: init.body as string };
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as unknown as typeof fetch;
  const res = await handler((r) => handleWebhookDispatch(r, f.ctx, { env, fetchFn, now }))(dispatchReq());
  assertEquals((await res.json()).results[0].status, "delivered");
  const ts = seen!.headers.get("x-webhook-timestamp")!;
  assertEquals(ts, String(now().getTime() / 1000));
  assertEquals(seen!.headers.get("x-webhook-signature"), `v1=${await hmacSha256Hex("whsec_abcdefghijklmnopqrstuvwx", `${ts}.${seen!.body}`)}`);
  const sent = JSON.parse(seen!.body);
  assertEquals(sent.id, 7);
  assertEquals(sent.order, {
    id: "o1",
    orderNo: "YK-7",
    externalRef: null,
    status: "yolda",
    previousStatus: "alindi",
    trackingUrl: "https://panel.ornek.com/takip/abc",
    deliveredAt: null,
    proofOfDelivery: null,
    cancelReason: null,
  });
  assertEquals(f.updated.webhook_deliveries![0]!.status, "delivered");
});

Deno.test("webhook: hata → üstel bekleme ile tekrar; son denemede failed; kapalı webhook", async () => {
  const fail = (() => Promise.resolve(new Response("x", { status: 500 }))) as unknown as typeof fetch;
  const a = webhookSetup(3);
  await handler((r) => handleWebhookDispatch(r, a.ctx, { env, fetchFn: fail, now }))(dispatchReq());
  const u = a.updated.webhook_deliveries![0]!;
  assertEquals(u.status, "pending");
  assertEquals(u.next_attempt_at, new Date(now().getTime() + 4 * 60_000).toISOString());
  const b = webhookSetup(WEBHOOK_MAX_ATTEMPTS);
  await handler((r) => handleWebhookDispatch(r, b.ctx, { env, fetchFn: fail, now }))(dispatchReq());
  assertEquals(b.updated.webhook_deliveries![0]!.status, "failed");
  const c = webhookSetup(1, { corporate_account_id: "acc1", url: "https://x", secret: "s", active: false });
  await handler((r) => handleWebhookDispatch(r, c.ctx, { env, fetchFn: fail, now }))(dispatchReq());
  assertEquals(c.updated.webhook_deliveries![0]!.last_error, "Webhook kapalı");
  assertEquals(retryDelayMs(20), 360 * 60_000);
});

Deno.test("webhook: gizli anahtarsız çağrı 401", async () => {
  const f = webhookSetup(1);
  const res = await handler((r) => handleWebhookDispatch(r, f.ctx, { env }))(new Request("http://x", { method: "POST" }));
  assertEquals(res.status, 401);
});
