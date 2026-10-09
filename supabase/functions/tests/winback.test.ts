import { assertEquals, assert } from "jsr:@std/assert@1";
import { handler } from "../_shared/http.ts";
import { handleWinback } from "../_shared/winback.ts";
import { fakeCtx } from "./fake.ts";

const env = (k: string) => (k === "NOTIFY_SECRET" ? "s" : undefined);
const cron = () => new Request("http://x", { method: "POST", headers: { "x-notify-secret": "s" } });
const NOW = new Date("2026-10-08T07:00:00Z");

Deno.test("geri kazanma: kapalıyken mesaj yok", async () => {
  const { ctx, inserted } = fakeCtx({ tables: { ops_settings: [{ id: 1, winback_enabled: false }] } });
  const r = await (await handler((q) => handleWinback(q, ctx, { env, now: NOW }))(cron())).json();
  assertEquals(r, { enabled: false, sent: 0 });
  assertEquals(inserted.promo_codes, undefined);
});

Deno.test("geri kazanma: adaya kişiye özel tek kullanımlık kod, son mesaj zamanı", async () => {
  const { ctx, inserted, updated } = fakeCtx({
    tables: {
      ops_settings: [{ id: 1, winback_enabled: true, winback_after_days: 30, winback_discount_pct: "15" }],
      "rpc:winback_candidates": [{ id: "c1", full_name: "Ayşe Yılmaz", phone: "+905321112233", push_token: null }],
      profiles: [{ id: "c1" }],
    },
  });
  const r = await (await handler((q) => handleWinback(q, ctx, { env, now: NOW }))(cron())).json();
  assertEquals(r.sent, 1);
  const code = inserted.promo_codes![0]!;
  assert(/^TEKRAR[A-Z2-9]{5}$/.test(String(code.code)));
  assertEquals([code.customer_id, code.value, code.max_redemptions, code.source], ["c1", 15, 1, "geri_kazanma"]);
  assertEquals(updated.profiles![0]!.last_winback_at, NOW.toISOString());
});

Deno.test("geri kazanma: gizli anahtarsız 401", async () => {
  const { ctx } = fakeCtx();
  assertEquals((await handler((q) => handleWinback(q, ctx, { env }))(new Request("http://x", { method: "POST" }))).status, 401);
});
