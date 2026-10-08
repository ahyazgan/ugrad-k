import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { handler } from "../_shared/http.ts";
import { handleInvoiceDispatch, handleInvoiceMonthly } from "../_shared/invoicing.ts";
import { ParasutClient, type ParasutConfig } from "../_shared/parasut.ts";
import { fakeCtx } from "./fake.ts";

const cfg: ParasutConfig = {
  clientId: "c",
  clientSecret: "s",
  username: "u",
  password: "p",
  companyId: "42",
  baseUrl: "https://api.parasut.test",
};
const parasutEnv: Record<string, string> = {
  PARASUT_CLIENT_ID: "c",
  PARASUT_CLIENT_SECRET: "s",
  PARASUT_USERNAME: "u",
  PARASUT_PASSWORD: "p",
  PARASUT_COMPANY_ID: "42",
  PARASUT_BASE_URL: "https://api.parasut.test",
  NOTIFY_SECRET: "sec",
};
const env = (vars: Record<string, string>) => (k: string) => vars[k];
const noSleep = () => Promise.resolve();

/** Yol bazlı sahte Paraşüt sunucusu */
function fakeParasut(opts: { inbox?: string; jobStatus?: string[] } = {}) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const jobStatuses = [...(opts.jobStatus ?? ["running", "done"])];
  const fetchFn = ((url: string, init: RequestInit) => {
    const path = url.replace("https://api.parasut.test", "");
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    const r = (j: unknown) => Promise.resolve(Response.json(j));
    if (path === "/oauth/token") return r({ access_token: "tok" });
    if (path.endsWith("/contacts")) return r({ data: { id: "c1" } });
    if (path.endsWith("/sales_invoices")) return r({ data: { id: "si1" } });
    if (path.includes("/e_invoice_inboxes")) {
      return r({ data: opts.inbox ? [{ attributes: { e_invoice_address: opts.inbox } }] : [] });
    }
    if (path.endsWith("/e_archives") || path.endsWith("/e_invoices")) return r({ data: { id: "job1" } });
    if (path.includes("/trackable_jobs/")) return r({ data: { attributes: { status: jobStatuses.shift() ?? "done" } } });
    if (path.includes("/sales_invoices/si1")) return r({ data: { relationships: { active_e_document: { data: { id: "ea1" } } } } });
    if (path.endsWith("/e_archives/ea1/pdf")) return r({ data: { attributes: { url: "https://pdf" } } });
    return Promise.resolve(new Response("bilinmeyen", { status: 404 }));
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const input = {
  buyer: { type: "person" as const, name: "Ayşe Yılmaz", tax_number: "11111111111" },
  description: "Kurye hizmeti YK-1001",
  subtotalKurus: 41050,
  vatPct: 20,
  issueDate: "2026-10-08",
  internetSale: { paymentDate: "2026-10-08" },
};

Deno.test("Paraşüt: bireysel → e-arşiv, internet satışı ve PDF", async () => {
  const { calls, fetchFn } = fakeParasut();
  const r = await new ParasutClient(cfg, fetchFn, noSleep).issue(input);
  assertEquals(r, { invoiceId: "si1", docType: "e_arsiv", docId: "ea1", pdfUrl: "https://pdf" });
  const inv = calls.find((c) => c.path === "/v4/42/sales_invoices")!.body as { data: { relationships: { details: { data: Array<{ attributes: { unit_price: string; vat_rate: number } }> } } } };
  assertEquals(inv.data.relationships.details.data[0]!.attributes.unit_price, "410.50");
  assertEquals(inv.data.relationships.details.data[0]!.attributes.vat_rate, 20);
  const arch = calls.find((c) => c.path === "/v4/42/e_archives")!.body as { data: { attributes: { internet_sale: { payment_platform: string } } } };
  assertEquals(arch.data.attributes.internet_sale.payment_platform, "iyzico");
  // Bireysel alıcıda e-fatura kutusu sorgulanmaz
  assertEquals(calls.some((c) => c.path.includes("e_invoice_inboxes")), false);
});

Deno.test("Paraşüt: e-fatura mükellefi şirket → e-fatura", async () => {
  const { calls, fetchFn } = fakeParasut({ inbox: "urn:mail:defaultpk@firma.com" });
  const r = await new ParasutClient(cfg, fetchFn, noSleep).issue({
    ...input,
    buyer: { type: "company", name: "Test A.Ş.", tax_number: "1234567890", tax_office: "Beykoz" },
    internetSale: null,
  });
  assertEquals(r.docType, "e_fatura");
  const e = calls.find((c) => c.path === "/v4/42/e_invoices")!.body as { data: { attributes: { to: string } } };
  assertEquals(e.data.attributes.to, "urn:mail:defaultpk@firma.com");
});

Deno.test("Paraşüt: belge işi hata verirse istisna", async () => {
  const { fetchFn } = fakeParasut({ jobStatus: ["error"] });
  await assertRejects(() => new ParasutClient(cfg, fetchFn, noSleep).issue(input), Error, "belge hatası");
});

const req = (headers: Record<string, string> = { "x-notify-secret": "sec" }) => new Request("http://x", { method: "POST", headers });

Deno.test("invoice-dispatch: yapılandırma yoksa kuyruğa dokunmaz", async () => {
  const { ctx } = fakeCtx({ tables: { "rpc:claim_invoices": [{ id: "i1" }] } });
  const res = await handler((r) => handleInvoiceDispatch(r, ctx, { env: env({ NOTIFY_SECRET: "sec" }) }))(req());
  assertEquals((await res.json()).processed, 0);
});

Deno.test("invoice-dispatch: keser ve kaydeder; hata olursa tekrar dener", async () => {
  const invoice = { id: "i1", order_id: "o1", attempts: 1, buyer: input.buyer, description: "x", subtotal_kurus: 41050, vat_pct: "20.00" };
  const ok = fakeCtx({ tables: { "rpc:claim_invoices": [invoice], orders: [{ id: "o1", payment_method: "nakit" }], invoices: [{ id: "i1" }] } });
  const { fetchFn } = fakeParasut();
  const res = await handler((r) => handleInvoiceDispatch(r, ok.ctx, { env: env(parasutEnv), fetchFn, sleep: noSleep }))(req());
  assertEquals((await res.json()).summary[0].status, "issued");
  assertEquals(ok.updated.invoices![0]!.pdf_url, "https://pdf");

  const bad = fakeCtx({ tables: { "rpc:claim_invoices": [invoice], orders: [], invoices: [{ id: "i1" }] } });
  const failing = (() => Promise.resolve(new Response("x", { status: 500 }))) as unknown as typeof fetch;
  const res2 = await handler((r) => handleInvoiceDispatch(r, bad.ctx, { env: env(parasutEnv), fetchFn: failing, sleep: noSleep }))(req());
  const s = (await res2.json()).summary[0];
  assertEquals(s.status, "pending");
  assert(String(s.error).includes("Paraşüt giriş hatası"));
});

const post = (body: unknown) =>
  new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer t" } });
const corp = { id: "corp1", company_name: "Test A.Ş.", tax_number: "1234567890", tax_office: "Beykoz", billing_email: null, billing_address: "x" };

Deno.test("invoice-monthly: yalnız yönetici, tamamlanmış ay", async () => {
  const notAdmin = fakeCtx({ tables: { profiles: [{ id: "u1", role: "musteri" }] } });
  assertEquals((await handler((r) => handleInvoiceMonthly(r, notAdmin.ctx))(post({ corporateAccountId: "corp1", month: "2026-09" }))).status, 403);
  const admin = fakeCtx({ tables: { profiles: [{ id: "u1", role: "admin" }], corporate_accounts: [corp] } });
  const thisMonth = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 7);
  assertEquals((await handler((r) => handleInvoiceMonthly(r, admin.ctx))(post({ corporateAccountId: "corp1", month: thisMonth }))).status, 400);
});

Deno.test("invoice-monthly: 20 teslimatta %15 indirimle fatura", async () => {
  const orders = Array.from({ length: 20 }, () => ({ subtotal_kurus: 40_000, corporate_account_id: "corp1", status: "teslim_edildi" }));
  const { ctx, inserted } = fakeCtx({ tables: { profiles: [{ id: "u1", role: "admin" }], corporate_accounts: [corp], orders } });
  const res = await handler((r) => handleInvoiceMonthly(r, ctx))(post({ corporateAccountId: "corp1", month: "2026-09" }));
  assertEquals(res.status, 201);
  const row = inserted.invoices![0]!;
  assertEquals(row.subtotal_kurus, 680_000);
  assertEquals(row.total_kurus, 816_000);
  assertEquals(row.description, "Eylül 2026 kurye hizmetleri (20 teslimat, %15 hacim indirimi uygulanmıştır)");
  assertEquals((row.buyer as { type: string }).type, "company");
});
