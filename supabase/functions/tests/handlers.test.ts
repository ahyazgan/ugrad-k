import { assertEquals, assert } from "jsr:@std/assert@1";
import { MOCK_PLACES } from "../../../packages/shared/index.ts";
import { handleCreateOrder, handlePlaces, handleQuote } from "../_shared/handlers.ts";
import { handler } from "../_shared/http.ts";
import { fakeCtx } from "./fake.ts";

const place = (id: string) => MOCK_PLACES.find((p) => p.placeId === id)!;
const post = (body: unknown) =>
  new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer t" } });
const orderBody = (extra = {}) => ({ pickup: place("mock-beykoz"), dropoff: place("mock-levent"), ...extra });
const consented = [
  { profile_id: "u1", consent_type: "kvkk_aydinlatma", granted: true },
  { profile_id: "u1", consent_type: "acik_riza_konum", granted: true },
];
const profiles = [{ id: "u1", role: "musteri", corporate_account_id: null }];

Deno.test("quote: fiyat ve yaka döner", async () => {
  const { ctx } = fakeCtx();
  const res = await handler((r) => handleQuote(r, ctx))(post(orderBody({ urgent: true })));
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.dropoffSide, "avrupa");
  assertEquals(data.bridgeCrossings, 1);
  assert(data.quote.lines.some((l: { code: string }) => l.code === "urgent"));
});

Deno.test("quote: girişsiz 401", async () => {
  const { ctx } = fakeCtx({ userId: null });
  const res = await handler((r) => handleQuote(r, ctx))(post(orderBody()));
  assertEquals(res.status, 401);
});

Deno.test("quote: hatalı istek 400 + alan adı", async () => {
  const { ctx } = fakeCtx();
  const res = await handler((r) => handleQuote(r, ctx))(post({ pickup: place("mock-beykoz") }));
  assertEquals(res.status, 400);
  assertEquals((await res.json()).field, "dropoff");
});

Deno.test("create-order: KVKK rızası yoksa 403", async () => {
  const { ctx, inserted } = fakeCtx({ tables: { profiles } });
  const res = await handler((r) => handleCreateOrder(r, ctx))(post(orderBody()));
  assertEquals(res.status, 403);
  assertEquals(inserted.orders, undefined);
});

Deno.test("create-order: fiyat sunucuda hesaplanır, istemci fiyatı yok sayılır", async () => {
  const { ctx, inserted } = fakeCtx({ tables: { profiles, current_consents: consented } });
  const res = await handler((r) => handleCreateOrder(r, ctx))(post(orderBody({ total_kurus: 1, subtotalKurus: 1 })));
  assertEquals(res.status, 201);
  const row = inserted.orders![0]!;
  assertEquals(row.customer_id, "u1");
  assert((row.total_kurus as number) > 35_000);
  assertEquals(row.payment_status, "odenmedi");
  assertEquals(row.bridge_crossings, 1);
});

Deno.test("create-order: gecikme telafisi kredisi düşülür ve kullanıldı işaretlenir", async () => {
  const customer_credits = [
    { id: "cr1", customer_id: "u1", amount_kurus: 20_000, reason: "YK-1001 acil teslim gecikmesi telafisi", used_order_id: null },
    { id: "cr2", customer_id: "u1", amount_kurus: 9_999_999, reason: "çok büyük", used_order_id: null },
  ];
  const { ctx, inserted, updated } = fakeCtx({ tables: { profiles, current_consents: consented, customer_credits } });
  const plain = await (await handler((r) => handleQuote(r, ctx))(post(orderBody()))).json();
  const credit = plain.quote.lines.find((l: { code: string }) => l.code === "credit");
  assertEquals(credit.amountKurus, -20_000);
  const res = await handler((r) => handleCreateOrder(r, ctx))(post(orderBody()));
  assertEquals(res.status, 201);
  const row = inserted.orders![0]!;
  assertEquals(row.subtotal_kurus, plain.quote.subtotalKurus);
  assertEquals(updated.customer_credits!.map((c) => [c.id, c.used_order_id]), [["cr1", "new-id"]]);
});

Deno.test("kampanya kodu: teklif ve siparişte indirim, kullanım kaydı; geçersiz kod 400", async () => {
  const promo_codes = [{ code: "HOSGELDIN", kind: "yuzde", value: "20", per_customer_limit: 1, min_subtotal_kurus: 0, active: true }];
  const { ctx, inserted } = fakeCtx({ tables: { profiles, current_consents: consented, promo_codes, promo_redemptions: [], orders: [] } });
  const q = await (await handler((r) => handleQuote(r, ctx))(post(orderBody({ promoCode: " hosgeldin " })))).json();
  const line = q.quote.lines.find((l: { code: string }) => l.code === "promo");
  assert(line.label.startsWith("Kampanya HOSGELDIN"));
  assert(line.amountKurus < 0);
  const res = await handler((r) => handleCreateOrder(r, ctx))(post(orderBody({ promoCode: "HOSGELDIN" })));
  assertEquals(res.status, 201);
  assertEquals(inserted.orders![0]!.promo_code, "HOSGELDIN");
  assertEquals(inserted.promo_redemptions![0]!.amount_kurus, -line.amountKurus);
  // Aynı müşteri ikinci kez kullanamaz
  const again = await handler((r) => handleQuote(r, ctx))(post(orderBody({ promoCode: "HOSGELDIN" })));
  assertEquals(again.status, 400);
  assertEquals(await again.json(), { error: "Bu kodu daha önce kullandınız", field: "promoCode" });
  const unknown = await handler((r) => handleQuote(r, ctx))(post(orderBody({ promoCode: "YOKKOD" })));
  assertEquals((await unknown.json()).error, "Kod bulunamadı");
});

Deno.test("davet kodu: yalnız ilk sipariş, kendi kodu olmaz, davet eden kaydedilir", async () => {
  const tables = {
    profiles: [...profiles.map((p) => ({ ...p, referred_by: null })), { id: "ref1", role: "musteri", referral_code: "ABC234" }],
    current_consents: consented,
    promo_codes: [],
    promo_redemptions: [],
    orders: [] as Record<string, unknown>[],
    ops_settings: [{ id: 1, referral_reward_kurus: 10_000 }],
  };
  const { ctx, inserted, updated } = fakeCtx({ tables });
  const res = await handler((r) => handleCreateOrder(r, ctx))(post(orderBody({ promoCode: "abc234" })));
  const data = await res.json();
  assertEquals(res.status, 201, JSON.stringify(data));
  assertEquals(data.quote.lines.find((l: { code: string }) => l.code === "promo").amountKurus, -10_000);
  assertEquals(inserted.promo_redemptions![0]!.kind, "davet");
  assertEquals(updated.profiles!.find((p) => p.id === "u1")!.referred_by, "ref1");
  // Artık ilk sipariş değil
  const second = await handler((r) => handleQuote(r, ctx))(post(orderBody({ promoCode: "ABC234" })));
  assertEquals((await second.json()).error, "Davet kodu yalnız ilk siparişte geçerli");
});

Deno.test("create-order: cari ödeme yalnız kurumsal", async () => {
  const { ctx } = fakeCtx({ tables: { profiles, current_consents: consented } });
  const res = await handler((r) => handleCreateOrder(r, ctx))(post(orderBody({ paymentMethod: "cari" })));
  assertEquals(res.status, 400);
});

Deno.test("create-order: kurumsal cari hesap", async () => {
  const { ctx, inserted } = fakeCtx({
    tables: { profiles: [{ id: "u1", role: "musteri", corporate_account_id: "c1" }], current_consents: consented },
  });
  const res = await handler((r) => handleCreateOrder(r, ctx))(post(orderBody({ paymentMethod: "cari" })));
  assertEquals(res.status, 201);
  assertEquals(inserted.orders![0]!.corporate_account_id, "c1");
  assertEquals(inserted.orders![0]!.payment_status, "cari_hesap");
});

Deno.test("places: kısa aramada boş, detayda yaka", async () => {
  const { ctx } = fakeCtx();
  const h = handler((r) => handlePlaces(r, ctx));
  assertEquals((await (await h(post({ input: "ka" }))).json()).suggestions, []);
  const s = (await (await h(post({ input: "kadıköy" }))).json()).suggestions;
  assertEquals(s[0].placeId, "mock-kadikoy");
  const d = (await (await h(post({ placeId: "mock-levent" }))).json()).place;
  assertEquals(d.side, "avrupa");
});

Deno.test("OPTIONS: CORS", async () => {
  const { ctx } = fakeCtx();
  const res = await handler((r) => handleQuote(r, ctx))(new Request("http://x", { method: "OPTIONS" }));
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("account-delete: aktif sipariş varsa 409, yoksa silinir", async () => {
  const { handleAccountDelete } = await import("../_shared/handlers.ts");
  const mk = (rpcError: unknown) => {
    const deleted: string[] = [];
    const { ctx } = fakeCtx();
    const admin = ctx.admin as unknown as Record<string, unknown>;
    admin.rpc = () => Promise.resolve({ data: null, error: rpcError });
    admin.auth = { admin: { deleteUser: (id: string) => (deleted.push(id), Promise.resolve({ error: null })) } };
    return { ctx, deleted };
  };
  const busy = mk({ code: "22023", message: "Devam eden siparişiniz varken hesap silinemez" });
  const r1 = await handler((r) => handleAccountDelete(r, busy.ctx))(post({}));
  assertEquals(r1.status, 409);
  assertEquals(busy.deleted.length, 0);
  const free = mk(null);
  const r2 = await handler((r) => handleAccountDelete(r, free.ctx))(post({}));
  assertEquals(r2.status, 200);
  assertEquals(free.deleted, ["u1"]);
});
