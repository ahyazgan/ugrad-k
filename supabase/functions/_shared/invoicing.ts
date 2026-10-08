// Fatura kuyruğu (invoice-dispatch) ve kurumsal aylık fatura oluşturma (invoice-monthly).
import { calculateMonthlyInvoice, monthlyInvoiceItem, type PriceQuote } from "../../../packages/shared/index.ts";
import type { Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { HttpError, json, readJson } from "./http.ts";
import { ParasutClient, parasutFromEnv, type InvoiceBuyer } from "./parasut.ts";

const MAX_ATTEMPTS = 5;
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export interface InvoiceDeps {
  env: Env;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const istDate = (d = new Date()) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

export async function handleInvoiceDispatch(req: Request, ctx: Ctx, deps: InvoiceDeps): Promise<Response> {
  const secret = deps.env("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) throw new HttpError(401, "Yetkisiz");
  await ctx.admin.rpc("record_heartbeat", { p_name: "invoice-dispatch" });
  const cfg = parasutFromEnv(deps.env);
  // Entegratör yapılandırılmadıysa kuyruğa dokunma (deneme hakları boşa gitmesin)
  if (!cfg) return json({ processed: 0, skipped: "Paraşüt yapılandırılmamış" });

  const { data: claimed, error } = await ctx.admin.rpc("claim_invoices", { p_limit: 10 });
  if (error) throw new Error(`Fatura kuyruğu okunamadı: ${error.message}`);
  const client = new ParasutClient(cfg, deps.fetchFn, deps.sleep);
  const summary: Array<{ id: string; status: string; error?: string }> = [];

  // deno-lint-ignore no-explicit-any
  for (const inv of (claimed ?? []) as any[]) {
    try {
      let internetSale: { paymentDate: string } | null = null;
      if (inv.order_id) {
        const { data: o } = await ctx.admin.from("orders").select("payment_method, paid_at").eq("id", inv.order_id).single();
        if (o?.payment_method === "kart" && o.paid_at) internetSale = { paymentDate: istDate(new Date(o.paid_at)) };
      }
      const issued = await client.issue({
        buyer: inv.buyer as InvoiceBuyer,
        description: inv.description,
        subtotalKurus: inv.subtotal_kurus,
        vatPct: Number(inv.vat_pct),
        issueDate: istDate(),
        internetSale,
      });
      await ctx.admin
        .from("invoices")
        .update({
          status: "issued",
          provider_invoice_id: issued.invoiceId,
          provider_doc_type: issued.docType,
          provider_doc_id: issued.docId,
          pdf_url: issued.pdfUrl,
          issued_at: new Date().toISOString(),
          last_error: null,
          locked_at: null,
        })
        .eq("id", inv.id);
      summary.push({ id: inv.id, status: "issued" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = inv.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await ctx.admin.from("invoices").update({ status, last_error: msg, locked_at: null }).eq("id", inv.id);
      summary.push({ id: inv.id, status, error: msg });
    }
  }
  return json({ processed: summary.length, summary });
}

/** Yönetici: kurumsal hesabın ay sonu faturasını kuyruğa ekler (tutar pricing.ts ile). */
export async function handleInvoiceMonthly(req: Request, ctx: Ctx): Promise<Response> {
  const user = await ctx.getUser(req);
  const { data: me } = await ctx.admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") throw new HttpError(403, "Yetkiniz yok");

  const body = (await readJson(req)) as { corporateAccountId?: unknown; month?: unknown };
  if (typeof body.corporateAccountId !== "string") throw new HttpError(400, "Hesap seçin", "corporateAccountId");
  if (typeof body.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)) {
    throw new HttpError(400, "Ay YYYY-AA biçiminde olmalı", "month");
  }
  const month = body.month;
  const [y, m] = month.split("-").map(Number) as [number, number];
  if (`${y}-${String(m).padStart(2, "0")}` >= istDate().slice(0, 7)) {
    throw new HttpError(400, "Yalnızca tamamlanmış aylar faturalanabilir", "month");
  }
  const start = new Date(Date.UTC(y, m - 1, 1) - 3 * 3600_000).toISOString();
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - 3 * 3600_000).toISOString();

  const [acc, orders, settingsRow] = await Promise.all([
    ctx.admin.from("corporate_accounts").select("*").eq("id", body.corporateAccountId).single(),
    ctx.admin
      .from("orders")
      .select("subtotal_kurus, price_quote")
      .eq("corporate_account_id", body.corporateAccountId)
      .eq("status", "teslim_edildi")
      .gte("delivered_at", start)
      .lt("delivered_at", end),
    ctx.loadPricing(),
  ]);
  if (!acc.data) throw new HttpError(404, "Kurumsal hesap bulunamadı");
  const a = acc.data;
  if (!a.tax_number) throw new HttpError(400, "Kurumsal hesapta vergi numarası eksik");
  // İndirim yalnız taşıma bedeline: kalemler kayıtlı tekliften ayrılır
  const subtotals = ((orders.data ?? []) as Array<{ subtotal_kurus: number; price_quote: PriceQuote | null }>).map((o) =>
    monthlyInvoiceItem(o.subtotal_kurus, o.price_quote),
  );
  if (!subtotals.length) throw new HttpError(400, "Bu ay teslim edilmiş sipariş yok");

  const inv = calculateMonthlyInvoice(subtotals, settingsRow.settings);
  const description =
    `${MONTHS[m - 1]} ${y} kurye hizmetleri (${inv.deliveryCount} teslimat` +
    (inv.discountPct ? `, %${inv.discountPct} hacim indirimi uygulanmıştır` : "") +
    ")";
  const { data, error } = await ctx.admin
    .from("invoices")
    .insert({
      kind: "monthly",
      corporate_account_id: a.id,
      period: month,
      buyer: {
        type: "company",
        name: a.company_name,
        tax_number: a.tax_number,
        tax_office: a.tax_office,
        email: a.billing_email,
        address: a.billing_address,
      },
      description,
      subtotal_kurus: inv.subtotalKurus,
      vat_pct: settingsRow.settings.vatPct,
      vat_kurus: inv.vatKurus,
      total_kurus: inv.totalKurus,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "Bu ay için fatura zaten oluşturulmuş");
    throw new Error(`Fatura oluşturulamadı: ${error.message}`);
  }
  return json({ id: data.id, ...inv }, 201);
}
