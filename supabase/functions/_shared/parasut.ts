// Paraşüt API v4 (JSON:API) ile e-arşiv / e-fatura kesimi.
// Ortam değişkenleri: PARASUT_CLIENT_ID, PARASUT_CLIENT_SECRET, PARASUT_USERNAME,
//   PARASUT_PASSWORD, PARASUT_COMPANY_ID, (isteğe bağlı) PARASUT_PRODUCT_ID, PARASUT_BASE_URL
// NOT: Paraşüt test hesabıyla uçtan uca doğrulanmalıdır (docs/kurulum.md).
import type { Env } from "./channels.ts";

export interface ParasutConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  companyId: string;
  productId?: string;
  baseUrl: string;
}

export function parasutFromEnv(env: Env): ParasutConfig | null {
  const clientId = env("PARASUT_CLIENT_ID");
  const clientSecret = env("PARASUT_CLIENT_SECRET");
  const username = env("PARASUT_USERNAME");
  const password = env("PARASUT_PASSWORD");
  const companyId = env("PARASUT_COMPANY_ID");
  if (!clientId || !clientSecret || !username || !password || !companyId) return null;
  return {
    clientId,
    clientSecret,
    username,
    password,
    companyId,
    productId: env("PARASUT_PRODUCT_ID") || undefined,
    baseUrl: env("PARASUT_BASE_URL") ?? "https://api.parasut.com",
  };
}

export interface InvoiceBuyer {
  type: "person" | "company";
  name: string;
  tax_number: string;
  tax_office?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface InvoiceInput {
  buyer: InvoiceBuyer;
  description: string;
  subtotalKurus: number;
  vatPct: number;
  issueDate: string; // YYYY-MM-DD
  /** Kartla internetten ödendiyse e-arşivde internet satışı bilgisi */
  internetSale?: { paymentDate: string } | null;
}

export interface IssuedInvoice {
  invoiceId: string;
  docType: "e_arsiv" | "e_fatura";
  docId: string | null;
  pdfUrl: string | null;
}

export class ParasutClient {
  private token: string | null = null;

  constructor(
    private cfg: ParasutConfig,
    private fetchFn: typeof fetch = fetch,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private async auth() {
    if (this.token) return this.token;
    const res = await this.fetchFn(`${this.cfg.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        username: this.cfg.username,
        password: this.cfg.password,
        redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
      }),
    });
    if (!res.ok) throw new Error(`Paraşüt giriş hatası (${res.status})`);
    this.token = ((await res.json()) as { access_token: string }).access_token;
    return this.token;
  }

  private async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchFn(`${this.cfg.baseUrl}/v4/${this.cfg.companyId}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.auth()}`,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Paraşüt ${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  async createContact(b: InvoiceBuyer): Promise<string> {
    const r = await this.api<{ data: { id: string } }>("POST", "/contacts", {
      data: {
        type: "contacts",
        attributes: {
          name: b.name,
          contact_type: b.type,
          tax_number: b.tax_number,
          tax_office: b.tax_office ?? undefined,
          email: b.email ?? undefined,
          phone: b.phone ?? undefined,
          address: b.address ?? undefined,
          city: "İstanbul",
          account_type: "customer",
        },
      },
    });
    return r.data.id;
  }

  async createSalesInvoice(contactId: string, i: InvoiceInput): Promise<string> {
    const detail: Record<string, unknown> = {
      type: "sales_invoice_details",
      attributes: {
        quantity: 1,
        unit_price: (i.subtotalKurus / 100).toFixed(2),
        vat_rate: i.vatPct,
        description: i.description,
      },
    };
    if (this.cfg.productId) {
      detail.relationships = { product: { data: { id: this.cfg.productId, type: "products" } } };
    }
    const r = await this.api<{ data: { id: string } }>("POST", "/sales_invoices", {
      data: {
        type: "sales_invoices",
        attributes: {
          item_type: "invoice",
          description: i.description,
          issue_date: i.issueDate,
          due_date: i.issueDate,
          currency: "TRL",
        },
        relationships: {
          contact: { data: { id: contactId, type: "contacts" } },
          details: { data: [detail] },
        },
      },
    });
    return r.data.id;
  }

  /** Alıcının e-fatura posta kutusu (mükellefse) */
  async eInvoiceInbox(taxNumber: string): Promise<string | null> {
    const r = await this.api<{ data: Array<{ attributes: { e_invoice_address: string } }> }>(
      "GET",
      `/e_invoice_inboxes?filter[vkn]=${encodeURIComponent(taxNumber)}`,
    );
    return r.data[0]?.attributes.e_invoice_address ?? null;
  }

  private async waitJob(jobId: string): Promise<void> {
    for (let i = 0; i < 20; i++) {
      const r = await this.api<{ data: { attributes: { status: string; errors?: string[] } } }>("GET", `/trackable_jobs/${jobId}`);
      const { status, errors } = r.data.attributes;
      if (status === "done") return;
      if (status === "error") throw new Error(`Paraşüt belge hatası: ${(errors ?? []).join(", ")}`);
      await this.sleep(1500);
    }
    throw new Error("Paraşüt belge işlemi zaman aşımına uğradı");
  }

  async issue(i: InvoiceInput): Promise<IssuedInvoice> {
    const contactId = await this.createContact(i.buyer);
    const invoiceId = await this.createSalesInvoice(contactId, i);
    const inbox = i.buyer.type === "company" ? await this.eInvoiceInbox(i.buyer.tax_number) : null;

    if (inbox) {
      const job = await this.api<{ data: { id: string } }>("POST", "/e_invoices", {
        data: {
          type: "e_invoices",
          attributes: { scenario: "commercial", to: inbox },
          relationships: { invoice: { data: { id: invoiceId, type: "sales_invoices" } } },
        },
      });
      await this.waitJob(job.data.id);
      return { invoiceId, docType: "e_fatura", docId: null, pdfUrl: null };
    }

    const attributes: Record<string, unknown> = {};
    if (i.internetSale) {
      attributes.internet_sale = {
        url: "https://yazgankurye.com",
        payment_type: "KREDIKARTI/BANKAKARTI",
        payment_platform: "iyzico",
        payment_date: i.internetSale.paymentDate,
      };
    }
    const job = await this.api<{ data: { id: string } }>("POST", "/e_archives", {
      data: {
        type: "e_archives",
        attributes,
        relationships: { sales_invoice: { data: { id: invoiceId, type: "sales_invoices" } } },
      },
    });
    await this.waitJob(job.data.id);
    // Belge kimliği ve PDF bağlantısı faturanın aktif e-belgesinden okunur
    const inv = await this.api<{ data: { relationships?: { active_e_document?: { data?: { id: string } } } } }>(
      "GET",
      `/sales_invoices/${invoiceId}?include=active_e_document`,
    );
    const docId = inv.data.relationships?.active_e_document?.data?.id ?? null;
    let pdfUrl: string | null = null;
    if (docId) {
      const pdf = await this.api<{ data?: { attributes?: { url?: string } } }>("GET", `/e_archives/${docId}/pdf`).catch(
        () => null,
      );
      pdfUrl = pdf?.data?.attributes?.url ?? null;
    }
    return { invoiceId, docType: "e_arsiv", docId, pdfUrl };
  }
}
