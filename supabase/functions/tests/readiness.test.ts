import { assert, assertEquals } from "jsr:@std/assert@1";
import { evaluateReadiness, handleReadiness } from "../_shared/readiness.ts";
import { handler } from "../_shared/http.ts";
import { fakeCtx } from "./fake.ts";

const NOW = new Date("2026-10-08T10:00:00Z");
const base = {
  heartbeats: {},
  now: NOW,
  pricingUpdatedBy: null,
  costUpdatedBy: null,
  holidaysNextYear: 0,
  compliantCouriers: 0,
  activeCouriers: 0,
  admins: 1,
  adminAlertPhones: 0,
  winbackEnabled: false,
};

Deno.test("hazırlık: hiçbir anahtar yoksa eksikler listelenir, gizli değer dönmez", () => {
  const items = evaluateReadiness({ ...base, env: () => undefined });
  const by = Object.fromEntries(items.map((i) => [i.key, i]));
  assertEquals(by.maps!.status, "eksik");
  assert(by.maps!.detail.includes("GOOGLE_MAPS_API_KEY eksik"));
  assertEquals(by.whatsapp!.status, "uyari");
  assertEquals(by["job:auto-dispatch"]!.status, "eksik");
  assertEquals(by.couriers!.status, "eksik");
  assertEquals(by["job:winback"], undefined);
});

Deno.test("hazırlık: iyzico sandbox uyarı, canlı ok; anahtar değerleri yanıtta yok", () => {
  const env = (k: string) => ({ IYZICO_API_KEY: "gizli-anahtar-123", IYZICO_SECRET_KEY: "x", IYZICO_BASE_URL: "https://sandbox-api.iyzipay.com" })[k];
  const items = evaluateReadiness({ ...base, env });
  assertEquals(items.find((i) => i.key === "payment")!.status, "uyari");
  assert(!JSON.stringify(items).includes("gizli-anahtar-123"));
  const live = evaluateReadiness({ ...base, env: (k) => ({ ...{ IYZICO_API_KEY: "a", IYZICO_SECRET_KEY: "b" }, IYZICO_BASE_URL: "https://api.iyzipay.com" })[k] });
  assertEquals(live.find((i) => i.key === "payment")!.status, "ok");
});

Deno.test("hazırlık: yalnız yönetici", async () => {
  const { ctx } = fakeCtx({ tables: { profiles: [{ id: "u1", role: "musteri" }] } });
  const res = await handler((r) => handleReadiness(r, ctx, { env: () => undefined }))(new Request("http://x", { headers: { Authorization: "Bearer t" } }));
  assertEquals(res.status, 403);
});
