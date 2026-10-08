import { assert, assertEquals } from "jsr:@std/assert@1";
import { MOCK_PLACES } from "../../../packages/shared/index.ts";
import { handler } from "../_shared/http.ts";
import { handleSite, normalizeTrPhone } from "../_shared/site.ts";
import { fakeCtx } from "./fake.ts";

// deno-lint-ignore no-explicit-any
type Json = any;
const place = (id: string) => MOCK_PLACES.find((p) => p.placeId === id)!;
const post = (body: unknown, ip = "1.2.3.4") =>
  new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });
const env = (k: string) => ({ ADMIN_ALERT_PHONES: "+905550000001" } as Record<string, string>)[k];

function setup(allow: (key: string) => boolean = () => true) {
  const f = fakeCtx({ userId: null, tables: { "rpc:hit_rate_limit": (a: Json) => allow(a.p_key), leads: [] } });
  const run = (body: unknown, ip?: string) => handler((r) => handleSite(r, f.ctx, { env }))(post(body, ip));
  return { ...f, run };
}

Deno.test("site: girişsiz fiyat hesaplar", async () => {
  const { run, rpcCalls } = setup();
  const res = await run({
    action: "quote",
    order: { pickup: place("mock-beykoz"), dropoff: place("mock-levent"), urgent: false, paymentMethod: "nakit" },
  });
  assertEquals(res.status, 200);
  const data = await res.json();
  assert(data.quote.totalKurus > 0);
  assertEquals(data.bridgeCrossings, 1);
  // IP ve günlük sınır sayaçları
  const keys = rpcCalls.filter((c) => c.name === "hit_rate_limit").map((c) => c.args.p_key as string);
  assertEquals(keys[0], "site:quote:1.2.3.4");
  assert(keys[1]!.startsWith("site:quote:gun:"));
});

Deno.test("site: hız sınırı aşılınca 429", async () => {
  const { run } = setup((k) => !k.includes("5.5.5.5"));
  const res = await run({ action: "places", input: "kadıköy" }, "5.5.5.5");
  assertEquals(res.status, 429);
  const ok = await run({ action: "places", input: "kadıköy" }, "6.6.6.6");
  assertEquals(ok.status, 200);
  assert((await ok.json()).suggestions.length > 0);
});

Deno.test("site: kurumsal başvuru kaydedilir, KVKK onayı zorunlu", async () => {
  const { run, inserted } = setup();
  const lead = { kind: "kurumsal", companyName: "Örnek Hukuk", contactName: "Av. Deniz", phone: "0216 555 44 33", monthlyVolume: "20-50", kvkkConsent: true };
  const noConsent = await run({ action: "lead", lead: { ...lead, kvkkConsent: false } });
  assertEquals(noConsent.status, 400);
  assertEquals((await noConsent.json()).field, "kvkkConsent");
  const res = await run({ action: "lead", lead });
  assertEquals(res.status, 200);
  assertEquals(inserted.leads?.length, 1);
  assertEquals(inserted.leads![0]!.phone, "+902165554433");
  assertEquals(inserted.leads![0]!.company_name, "Örnek Hukuk");
});

Deno.test("site: bal küpü dolu ise kaydetmez; şirket adı zorunlu", async () => {
  const { run, inserted } = setup();
  const res = await run({ action: "lead", lead: { contactName: "Bot", phone: "05321112233", kvkkConsent: true, website: "http://spam" } });
  assertEquals(res.status, 200);
  assertEquals(inserted.leads, undefined);
  const missing = await run({ action: "lead", lead: { kind: "kurumsal", contactName: "A", phone: "05321112233", kvkkConsent: true } });
  assertEquals((await missing.json()).field, "companyName");
});

Deno.test("site: telefon normalizasyonu", () => {
  assertEquals(normalizeTrPhone("+90 532 111 22 33"), "+905321112233");
  assertEquals(normalizeTrPhone("02125554433"), "+902125554433");
  let threw = false;
  try {
    normalizeTrPhone("12345");
  } catch {
    threw = true;
  }
  assert(threw);
});

function withStorage(f: ReturnType<typeof setup>) {
  const signed: string[] = [];
  (f.ctx.admin as Json).storage = {
    from: (bucket: string) => ({
      createSignedUploadUrl: (path: string) => {
        signed.push(`${bucket}/${path}`);
        return Promise.resolve({ data: { signedUrl: `https://s/${bucket}/${path}?token=t`, path, token: "t" }, error: null });
      },
    }),
  };
  return signed;
}

const application = {
  fullName: "Can Kurye",
  phone: "0555 111 22 33",
  birthYear: 1995,
  licenseClass: "A2",
  hasMotorcycle: true,
  plate: "34 abc 12",
  availability: "tam_zamanli",
  kvkkConsent: true,
  documents: [
    { kind: "ehliyet_on", ext: "JPG" },
    { kind: "ruhsat", ext: "pdf" },
  ],
};

Deno.test("site: kurye başvurusu kaydedilir, belgeler için imzalı yükleme adresi döner", async () => {
  const f = setup();
  const signed = withStorage(f);
  const res = await f.run({ action: "courier-apply", application });
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.uploads.length, 2);
  assert(data.uploads[0].signedUrl.startsWith("https://s/basvuru/new-id/ehliyet_on-"));
  assert(signed[0]!.endsWith(".jpg"));
  const row = f.inserted.courier_applications![0]!;
  assertEquals(row.phone, "+905551112233");
  assertEquals(row.plate, "34 ABC 12");
  assertEquals((f.updated.courier_applications![0]!.documents as Json[]).map((d) => d.kind), ["ehliyet_on", "ruhsat"]);
});

Deno.test("site: kurye başvurusu doğrulamaları", async () => {
  const f = setup();
  withStorage(f);
  const young = await f.run({ action: "courier-apply", application: { ...application, birthYear: new Date().getUTCFullYear() - 16 } });
  assertEquals((await young.json()).field, "birthYear");
  const badDoc = await f.run({ action: "courier-apply", application: { ...application, documents: [{ kind: "adli_sicil", ext: "pdf" }] } });
  assertEquals(badDoc.status, 400);
  const exe = await f.run({ action: "courier-apply", application: { ...application, documents: [{ kind: "ruhsat", ext: "exe" }] } });
  assertEquals((await exe.json()).error, "Belge JPG, PNG veya PDF olmalı");
  const landline = await f.run({ action: "courier-apply", application: { ...application, phone: "0216 555 44 33" } });
  assertEquals((await landline.json()).field, "phone");
  assertEquals(f.inserted.courier_applications, undefined);
});
