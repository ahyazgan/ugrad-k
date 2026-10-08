import { assert, assertEquals } from "jsr:@std/assert@1";
import { handler } from "../_shared/http.ts";
import { authorizationHeader, buildCheckoutRequest, hmacSha256Hex, iyzicoPrice } from "../_shared/iyzico.ts";
import { handlePaymentCallback, handlePaymentInit, handlePaymentRefund } from "../_shared/payments.ts";
import { fakeCtx } from "./fake.ts";

const env = (vars: Record<string, string>) => (k: string) => vars[k];
const iyzi = { IYZICO_API_KEY: "api", IYZICO_SECRET_KEY: "secret", SUPABASE_URL: "https://p.supabase.co" };
const post = (body: unknown) =>
  new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer t" } });

Deno.test("iyzico: HMAC-SHA256 bilinen vektör", async () => {
  // RFC 4231 test case 2
  assertEquals(
    await hmacSha256Hex("Jefe", "what do ya want for nothing?"),
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
  );
});

Deno.test("iyzico: IYZWSv2 başlığı", async () => {
  const h = await authorizationHeader({ apiKey: "api", secretKey: "secret", baseUrl: "" }, "/p", "{}", "123");
  const decoded = atob(h.replace("IYZWSv2 ", ""));
  const sig = await hmacSha256Hex("secret", "123/p{}");
  assertEquals(decoded, `apiKey:api&randomKey:123&signature:${sig}`);
});

Deno.test("iyzico: fiyat biçimi ve sepet toplamı", () => {
  assertEquals(iyzicoPrice(166200), "1662");
  assertEquals(iyzicoPrice(41050), "410.5");
  assertEquals(iyzicoPrice(12345), "123.45");
  const r = buildCheckoutRequest({
    orderId: "o1",
    orderNo: "YK-1",
    totalKurus: 41050,
    callbackUrl: "cb",
    buyer: { id: "u", name: "A", surname: "B", gsmNumber: "+905", email: "e@x", identityNumber: "1", address: "x", city: "Istanbul", ip: "1" },
  });
  assertEquals(r.price, r.paidPrice);
  assertEquals(r.basketItems[0]!.price, r.price);
  assertEquals(r.basketId, "o1");
});

const order = {
  id: "o1",
  order_no: "YK-1",
  customer_id: "u1",
  status: "beklemede",
  payment_method: "kart",
  payment_status: "odenmedi",
  total_kurus: 41050,
  pickup_address: "Beykoz",
};

Deno.test("payment-init: yapılandırma yoksa 503", async () => {
  const { ctx } = fakeCtx({ tables: { orders: [order] } });
  const res = await handler((r) => handlePaymentInit(r, ctx, { env: env({}) }))(post({ orderId: "o1" }));
  assertEquals(res.status, 503);
});

Deno.test("payment-init: başkasının siparişi 404, ödenmiş 409", async () => {
  const { ctx } = fakeCtx({ userId: "u2", tables: { orders: [order] } });
  assertEquals((await handler((r) => handlePaymentInit(r, ctx, { env: env(iyzi) }))(post({ orderId: "o1" }))).status, 404);
  const paid = fakeCtx({ tables: { orders: [{ ...order, payment_status: "odendi" }] } });
  assertEquals((await handler((r) => handlePaymentInit(r, paid.ctx, { env: env(iyzi) }))(post({ orderId: "o1" }))).status, 409);
});

Deno.test("payment-init: ödeme sayfası açar, token saklanır", async () => {
  const { ctx, updated } = fakeCtx({ tables: { orders: [order], profiles: [{ id: "u1", full_name: "Ayşe Nur Yılmaz", phone: "905321112233", email: null }] } });
  let sent: Record<string, unknown> = {};
  let headers: Record<string, string> = {};
  const fetchFn = ((_u: string, init: RequestInit) => {
    sent = JSON.parse(init.body as string);
    headers = init.headers as Record<string, string>;
    return Promise.resolve(Response.json({ status: "success", token: "tok", paymentPageUrl: "https://pay" }));
  }) as unknown as typeof fetch;
  const res = await handler((r) => handlePaymentInit(r, ctx, { env: env(iyzi), fetchFn }))(post({ orderId: "o1" }));
  assertEquals((await res.json()).paymentPageUrl, "https://pay");
  assertEquals((sent.buyer as { name: string; surname: string }).name, "Ayşe Nur");
  assertEquals((sent.buyer as { gsmNumber: string }).gsmNumber, "+905321112233");
  assertEquals(sent.callbackUrl, "https://p.supabase.co/functions/v1/payment-callback");
  assert(headers.Authorization.startsWith("IYZWSv2 "));
  assertEquals(updated.orders![0]!.payment_token, "tok");
});

const callbackReq = (token: string) => {
  const fd = new FormData();
  fd.set("token", token);
  return new Request("http://x", { method: "POST", body: fd });
};

Deno.test("payment-callback: başarılı ödeme siparişi ödendi yapar", async () => {
  const { ctx, updated } = fakeCtx({ tables: { orders: [{ ...order, payment_token: "tok" }] } });
  const fetchFn = (() =>
    Promise.resolve(Response.json({ status: "success", paymentStatus: "SUCCESS", paymentId: "p9", paidPrice: 410.5, basketId: "o1" }))) as unknown as typeof fetch;
  const res = await handlePaymentCallback(callbackReq("tok"), ctx, { env: env(iyzi), fetchFn });
  const html = await res.text();
  assert(html.includes("yazgankurye://odeme?durum=basarili&siparis=o1"));
  assertEquals(updated.orders![0]!.payment_status, "odendi");
  assertEquals(updated.orders![0]!.paid_kurus, 41050);
});

Deno.test("payment-callback: tutar uyuşmazlığında ödendi yapılmaz", async () => {
  const { ctx, updated } = fakeCtx({ tables: { orders: [{ ...order, payment_token: "tok" }] } });
  const fetchFn = (() =>
    Promise.resolve(Response.json({ status: "success", paymentStatus: "SUCCESS", paymentId: "p9", paidPrice: 1, basketId: "o1" }))) as unknown as typeof fetch;
  const html = await (await handlePaymentCallback(callbackReq("tok"), ctx, { env: env(iyzi), fetchFn })).text();
  assert(html.includes("durum=hata"));
  assertEquals(updated.orders![0]!.payment_status, "odenmedi");
  assert(String(updated.orders![0]!.payment_error).startsWith("Tutar uyuşmazlığı"));
});

Deno.test("payment-callback: bilinmeyen token", async () => {
  const { ctx } = fakeCtx({ tables: { orders: [] } });
  const html = await (await handlePaymentCallback(callbackReq("yok"), ctx, { env: env(iyzi) })).text();
  assert(html.includes("Sipariş bulunamadı"));
});

Deno.test("payment-refund: iptal edilmemiş sipariş 409; iyzico hatasında iade_bekliyor", async () => {
  const active = fakeCtx({ tables: { orders: [{ ...order, payment_status: "odendi", payment_ref: "p9" }] } });
  assertEquals((await handler((r) => handlePaymentRefund(r, active.ctx, { env: env(iyzi) }))(post({ orderId: "o1" }))).status, 409);

  const { ctx, updated } = fakeCtx({ tables: { orders: [{ ...order, status: "iptal", payment_status: "odendi", payment_ref: "p9" }] } });
  const fetchFn = (() => Promise.resolve(Response.json({ status: "failure", errorMessage: "gün sonu" }))) as unknown as typeof fetch;
  const res = await handler((r) => handlePaymentRefund(r, ctx, { env: env(iyzi), fetchFn }))(post({ orderId: "o1" }));
  assertEquals((await res.json()).refunded, false);
  assertEquals(updated.orders![0]!.payment_status, "iade_bekliyor");
});

Deno.test("payment-refund: başarılı iptal", async () => {
  const { ctx, updated } = fakeCtx({ tables: { orders: [{ ...order, status: "iptal", payment_status: "odendi", payment_ref: "p9" }] } });
  const fetchFn = (() => Promise.resolve(Response.json({ status: "success", paymentId: "p9" }))) as unknown as typeof fetch;
  const res = await handler((r) => handlePaymentRefund(r, ctx, { env: env(iyzi), fetchFn }))(post({ orderId: "o1" }));
  assertEquals((await res.json()).refunded, true);
  assertEquals(updated.orders![0]!.payment_status, "iade_edildi");
});
