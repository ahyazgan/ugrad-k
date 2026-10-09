import { assertEquals } from "jsr:@std/assert@1";
import { DEFAULT_PRICING_SETTINGS, calculatePrice } from "../../../packages/shared/index.ts";
import { handleRepriceOrder } from "../_shared/handlers.ts";
import { handler } from "../_shared/http.ts";
import { fakeCtx } from "./fake.ts";

const quote = calculatePrice({ distanceMeters: 5_000, pickupAt: new Date("2026-10-07T11:00:00Z") }, DEFAULT_PRICING_SETTINGS);
const order = (extra = {}) => ({
  id: "o1",
  courier_id: "k1",
  status: "alindi",
  waiting_minutes: 27,
  price_quote: quote,
  total_kurus: quote.totalKurus,
  ...extra,
});
const post = (body: unknown) =>
  new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer t" } });

Deno.test("reprice: atanmış kurye bekleme ücretini ekler", async () => {
  const { ctx, updated } = fakeCtx({ userId: "k1", tables: { orders: [order()] } });
  const res = await handler((r) => handleRepriceOrder(r, ctx))(post({ orderId: "o1" }));
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.changed, true);
  assertEquals(data.quote.subtotalKurus, quote.subtotalKurus + 10_000); // 27 dk → 2 dilim
  assertEquals(updated.orders![0]!.total_kurus, data.quote.totalKurus);
});

Deno.test("reprice: başka kurye 403", async () => {
  const { ctx } = fakeCtx({ userId: "k2", tables: { orders: [order()], profiles: [{ id: "k2", role: "kurye" }] } });
  const res = await handler((r) => handleRepriceOrder(r, ctx))(post({ orderId: "o1" }));
  assertEquals(res.status, 403);
});

Deno.test("reprice: yönetici yapabilir; değişiklik yoksa yazmaz", async () => {
  const { ctx, updated } = fakeCtx({
    userId: "a1",
    tables: { orders: [order({ waiting_minutes: 10 })], profiles: [{ id: "a1", role: "admin" }] },
  });
  const res = await handler((r) => handleRepriceOrder(r, ctx))(post({ orderId: "o1" }));
  assertEquals((await res.json()).changed, false);
  assertEquals(updated.orders, undefined);
});

Deno.test("reprice: kapanmış siparişte kurye 409", async () => {
  const { ctx } = fakeCtx({ userId: "k1", tables: { orders: [order({ status: "teslim_edildi" })] } });
  const res = await handler((r) => handleRepriceOrder(r, ctx))(post({ orderId: "o1" }));
  assertEquals(res.status, 409);
});

Deno.test("reprice: teslim edilemeyen işte iade ücreti; dönüşte ücretli köprü yönüne geçiliyorsa köprü", async () => {
  const { ctx, updated } = fakeCtx({
    userId: "k1",
    tables: { orders: [order({ status: "geri_donuyor", waiting_minutes: 0, failed_at: "2026-10-07T12:00:00Z", round_trip: false, pickup_side: "avrupa", dropoff_side: "anadolu" })] },
  });
  const data = await (await handler((r) => handleRepriceOrder(r, ctx))(post({ orderId: "o1" }))).json();
  const codes = data.quote.lines.map((l: { code: string }) => l.code);
  assertEquals(codes.includes("failed_return"), true);
  // 5 km: 350 + 2×25 = 400 TL → iade 200 TL; köprü 25 TL
  assertEquals(data.quote.subtotalKurus, quote.subtotalKurus + 20_000 + 2_500);
  assertEquals(updated.orders![0]!.total_kurus, data.quote.totalKurus);
});

Deno.test("reprice: iade teslim edildikten sonra kurye değiştiremez", async () => {
  const { ctx } = fakeCtx({ userId: "k1", tables: { orders: [order({ status: "geri_teslim" })] } });
  assertEquals((await handler((r) => handleRepriceOrder(r, ctx))(post({ orderId: "o1" }))).status, 409);
});
