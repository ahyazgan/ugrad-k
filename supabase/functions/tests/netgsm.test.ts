import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { normalizeTrMobile, sendSms } from "../_shared/netgsm.ts";

Deno.test("telefon normalizasyonu", () => {
  assertEquals(normalizeTrMobile("+90 532 123 45 67"), "5321234567");
  assertEquals(normalizeTrMobile("905321234567"), "5321234567");
  assertEquals(normalizeTrMobile("05321234567"), "5321234567");
  assertThrows(() => normalizeTrMobile("02161234567"));
});

Deno.test("kimlik yoksa deneme modu", async () => {
  const r = await sendSms("905321234567", "test", { env: () => undefined });
  assertEquals(r, { sent: false, dryRun: true });
});

Deno.test("Netgsm isteği ve başarı kodu", async () => {
  let captured: { url: string; init: RequestInit } | null = null;
  const env = (k: string) => ({ NETGSM_USERCODE: "u", NETGSM_PASSWORD: "p", NETGSM_HEADER: "YAZGAN" })[k];
  const fetchFn = ((url: string, init: RequestInit) => {
    captured = { url, init };
    return Promise.resolve(Response.json({ code: "00", jobid: "J1" }));
  }) as unknown as typeof fetch;
  const r = await sendSms("+905321234567", "Merhaba", { env, fetchFn });
  assertEquals(r, { sent: true, jobId: "J1" });
  const body = JSON.parse(captured!.init.body as string);
  assertEquals(body.messages[0].no, "5321234567");
  assertEquals(body.msgheader, "YAZGAN");
});

Deno.test("Netgsm hata kodu", async () => {
  const env = (k: string) => ({ NETGSM_USERCODE: "u", NETGSM_PASSWORD: "p", NETGSM_HEADER: "Y" })[k];
  const fetchFn = (() => Promise.resolve(Response.json({ code: "30" }))) as unknown as typeof fetch;
  await assertRejects(() => sendSms("5321234567", "x", { env, fetchFn }));
});
