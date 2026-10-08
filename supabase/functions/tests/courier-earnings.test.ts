import { assertEquals } from "jsr:@std/assert@1";
import { calculatePrice, DEFAULT_PRICING_SETTINGS } from "../../../packages/shared/index.ts";
import { earningRow, handleCourierEarnings } from "../_shared/courier-earnings.ts";
import { handler } from "../_shared/http.ts";
import { fakeCtx } from "./fake.ts";

const env = (k: string) => (k === "NOTIFY_SECRET" ? "s3cret" : undefined);
const cron = () => new Request("http://x/courier-earnings", { method: "POST", headers: { "x-notify-secret": "s3cret" } });
const WED = new Date("2026-10-07T08:00:00Z");

const order = (over: Record<string, unknown> = {}) => ({
  id: "o1",
  courier_id: "k1",
  delivered_at: "2026-10-07T09:00:00Z",
  payment_method: "nakit",
  cash_collection: "nakit",
  total_kurus: 48_000,
  distance_meters: 5_000,
  price_quote: calculatePrice({ distanceMeters: 5_000, pickupAt: WED }, DEFAULT_PRICING_SETTINGS),
  ...over,
});

Deno.test("hakediş satırı: teklif + nakit tahsilat", () => {
  const r = earningRow(order());
  assertEquals(r.total_kurus, 15_000 + 5 * 1_200);
  assertEquals(r.cash_collected_kurus, 48_000);
  assertEquals(earningRow(order({ cash_collection: "iban" })).cash_collected_kurus, 0);
  assertEquals(earningRow(order({ payment_method: "kart", cash_collection: null })).cash_collected_kurus, 0);
  // Teklifi olmayan eski sipariş: mesafeden hesaplanır
  assertEquals(earningRow(order({ price_quote: {}, distance_meters: 7_400 })).km, 8);
});

Deno.test("courier-earnings: cron bekleyenleri ödeme modeline göre yazar, nabız atar", async () => {
  const { ctx, inserted, rpcCalls } = fakeCtx({
    tables: {
      "rpc:pending_courier_earnings": [order(), order({ id: "o2", payment_method: "cari", cash_collection: null })],
      cost_settings: [{ id: 1, courier_per_job_kurus: 20_000, courier_per_km_kurus: 1_000, urgent_bonus_pct: "30", off_hours_bonus_pct: "30", economy_job_pay_pct: "60", waiting_share_pct: "50", overhead_per_job_kurus: 3_000, card_fee_pct: "2.5" }],
    },
  });
  const res = await handler((r) => handleCourierEarnings(r, ctx, { env }))(cron());
  const body = await res.json();
  assertEquals(body.written, 2);
  const rows = inserted.courier_earnings!;
  assertEquals(rows.map((r) => r.total_kurus), [25_000, 25_000]);
  assertEquals(rows.map((r) => r.cash_collected_kurus), [48_000, 0]);
  assertEquals(rpcCalls.some((c) => c.name === "record_heartbeat" && c.args.p_name === "courier-earnings"), true);
  assertEquals(rpcCalls.at(-1)?.name, "compute_incentive_awards");
});

Deno.test("courier-earnings: bekleyen yokken de primler hesaplanır", async () => {
  const { ctx, inserted, rpcCalls } = fakeCtx({ tables: { "rpc:compute_incentive_awards": 3 } });
  const res = await handler((r) => handleCourierEarnings(r, ctx, { env }))(cron());
  assertEquals(await res.json(), { trigger: "cron", written: 0, awards: 3 });
  assertEquals(inserted.courier_earnings, undefined);
  assertEquals(rpcCalls.filter((c) => c.name === "compute_incentive_awards").length, 1);
});

Deno.test("courier-earnings: yetkisiz 401, müşteri 401", async () => {
  const anon = fakeCtx();
  assertEquals((await handler((r) => handleCourierEarnings(r, anon.ctx, { env }))(new Request("http://x", { method: "POST" }))).status, 401);
  const cust = fakeCtx({ tables: { profiles: [{ id: "u1", role: "musteri" }] } });
  const req = new Request("http://x", { method: "POST", headers: { Authorization: "Bearer t" } });
  assertEquals((await handler((r) => handleCourierEarnings(r, cust.ctx, { env }))(req)).status, 401);
});
