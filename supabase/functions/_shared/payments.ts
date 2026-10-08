// Kartla ödeme akışı: payment-init → (iyzico ödeme sayfası) → payment-callback; iptalde payment-refund.
import type { Ctx } from "./context.ts";
import { HttpError, json, readJson } from "./http.ts";
import {
  cancelPayment,
  initializeCheckout,
  iyzicoFromEnv,
  retrieveCheckout,
  type CheckoutBuyer,
} from "./iyzico.ts";
import type { Env } from "./channels.ts";

export interface PaymentDeps {
  env: Env;
  fetchFn?: typeof fetch;
}

const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "85.34.78.112";

function splitName(full: string | null): { name: string; surname: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { name: "Müşteri", surname: "Yazgan" };
  if (parts.length === 1) return { name: parts[0]!, surname: parts[0]! };
  return { name: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1]! };
}

export async function handlePaymentInit(req: Request, ctx: Ctx, deps: PaymentDeps): Promise<Response> {
  const user = await ctx.getUser(req);
  const cfg = iyzicoFromEnv(deps.env);
  if (!cfg) throw new HttpError(503, "Online ödeme henüz aktif değil. Lütfen kuryeye ödeme seçeneğini kullanın.");

  const body = (await readJson(req)) as { orderId?: unknown };
  if (typeof body.orderId !== "string") throw new HttpError(400, "orderId gerekli", "orderId");

  const { data: o } = await ctx.admin
    .from("orders")
    .select("id, order_no, customer_id, status, payment_method, payment_status, total_kurus, pickup_address")
    .eq("id", body.orderId)
    .single();
  if (!o || o.customer_id !== user.id) throw new HttpError(404, "Sipariş bulunamadı");
  if (o.payment_method !== "kart") throw new HttpError(400, "Bu sipariş kartla ödenmiyor");
  if (o.payment_status !== "odenmedi") throw new HttpError(409, "Bu siparişin ödemesi zaten yapılmış");
  if (o.status === "iptal") throw new HttpError(409, "İptal edilmiş sipariş ödenemez");

  const { data: p } = await ctx.admin.from("profiles").select("full_name, phone, email").eq("id", user.id).single();
  const { name, surname } = splitName(p?.full_name ?? null);
  const digits = (p?.phone ?? user.phone ?? "").replace(/\D/g, "").replace(/^(90|0)/, "");
  const buyer: CheckoutBuyer = {
    id: user.id,
    name,
    surname,
    gsmNumber: `+90${digits}`,
    email: p?.email || `musteri-${user.id.slice(0, 8)}@yazgankurye.com`,
    // Bireysel müşteride TCKN istenmiyor; iyzico'nun kabul ettiği genel değer
    identityNumber: "11111111111",
    address: o.pickup_address,
    city: "Istanbul",
    ip: clientIp(req),
  };

  const callbackUrl = `${deps.env("SUPABASE_URL")}/functions/v1/payment-callback`;
  const init = await initializeCheckout(
    cfg,
    { orderId: o.id, orderNo: o.order_no, totalKurus: o.total_kurus, callbackUrl, buyer },
    deps.fetchFn,
  );
  await ctx.admin.from("orders").update({ payment_token: init.token, payment_error: null }).eq("id", o.id);
  return json({ paymentPageUrl: init.paymentPageUrl, token: init.token });
}

function resultPage(ok: boolean, orderId: string | null, message: string, deps: PaymentDeps) {
  const appUrl = `yazgankurye://odeme?durum=${ok ? "basarili" : "hata"}${orderId ? `&siparis=${orderId}` : ""}`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ödeme ${ok ? "başarılı" : "başarısız"}</title>
<meta http-equiv="refresh" content="1;url=${appUrl}"></head>
<body style="font-family:system-ui;padding:32px;text-align:center">
<h2 style="color:${ok ? "#047857" : "#B91C1C"}">${ok ? "Ödemeniz alındı" : "Ödeme tamamlanamadı"}</h2>
<p>${message}</p><p><a href="${appUrl}">Uygulamaya dön</a></p></body></html>`;
  void deps;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/** iyzico, kullanıcıyı ödeme sonrası bu adrese POST eder (form: token). */
export async function handlePaymentCallback(req: Request, ctx: Ctx, deps: PaymentDeps): Promise<Response> {
  const cfg = iyzicoFromEnv(deps.env);
  if (!cfg) return resultPage(false, null, "Ödeme sistemi yapılandırılmamış.", deps);
  const form = await req.formData().catch(() => null);
  const token = form?.get("token")?.toString() ?? new URL(req.url).searchParams.get("token");
  if (!token) return resultPage(false, null, "Geçersiz istek.", deps);

  const { data: o } = await ctx.admin
    .from("orders")
    .select("id, status, total_kurus, payment_status, payment_token")
    .eq("payment_token", token)
    .single();
  if (!o) return resultPage(false, null, "Sipariş bulunamadı.", deps);
  if (o.payment_status === "odendi") return resultPage(true, o.id, "Ödeme daha önce alınmış.", deps);

  try {
    // Sonuç her zaman iyzico'dan sunucu tarafında doğrulanır (istemciye güvenilmez)
    const r = await retrieveCheckout(cfg, token, deps.fetchFn);
    const paidKurus = Math.round(Number(r.paidPrice) * 100);
    if (r.paymentStatus !== "SUCCESS" || r.basketId !== o.id) {
      await ctx.admin.from("orders").update({ payment_error: `Durum: ${r.paymentStatus}` }).eq("id", o.id);
      return resultPage(false, o.id, "Kart ödemesi onaylanmadı. Tekrar deneyebilirsiniz.", deps);
    }
    // Ödeme sırasında sipariş iptal edildiyse (ör. ödeme süresi doldu) tahsilat hemen iptal edilir
    if (o.status === "iptal") {
      try {
        await cancelPayment(cfg, r.paymentId, clientIp(req), deps.fetchFn);
        await ctx.admin
          .from("orders")
          .update({ payment_ref: r.paymentId, payment_status: "iade_edildi", payment_error: "Sipariş iptal edilmişti; ödeme iade edildi" })
          .eq("id", o.id);
        return resultPage(false, o.id, "Siparişiniz ödeme süresi dolduğu için iptal edilmişti; ödemeniz iade edildi.", deps);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await ctx.admin
          .from("orders")
          .update({ payment_ref: r.paymentId, payment_status: "iade_bekliyor", payment_error: `İptal edilmiş siparişe ödeme: ${msg}` })
          .eq("id", o.id);
        return resultPage(false, o.id, "Siparişiniz iptal edilmişti; ödemeniz en kısa sürede iade edilecek.", deps);
      }
    }
    if (paidKurus !== o.total_kurus) {
      await ctx.admin.from("orders").update({ payment_error: `Tutar uyuşmazlığı: ${paidKurus}` }).eq("id", o.id);
      return resultPage(false, o.id, "Ödeme tutarı uyuşmuyor; ekibimiz sizinle iletişime geçecek.", deps);
    }
    await ctx.admin
      .from("orders")
      .update({
        payment_status: "odendi",
        payment_ref: r.paymentId,
        paid_kurus: paidKurus,
        paid_at: new Date().toISOString(),
        payment_error: null,
      })
      .eq("id", o.id);
    return resultPage(true, o.id, "Siparişiniz işleme alındı.", deps);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.admin.from("orders").update({ payment_error: msg }).eq("id", o.id);
    return resultPage(false, o.id, "Ödeme doğrulanamadı.", deps);
  }
}

/** İptal edilen ve kartla ödenmiş siparişin ödemesini iptal eder (müşteri veya yönetici). */
export async function handlePaymentRefund(req: Request, ctx: Ctx, deps: PaymentDeps): Promise<Response> {
  const user = await ctx.getUser(req);
  const body = (await readJson(req)) as { orderId?: unknown };
  if (typeof body.orderId !== "string") throw new HttpError(400, "orderId gerekli", "orderId");

  const { data: o } = await ctx.admin
    .from("orders")
    .select("id, customer_id, status, payment_status, payment_ref")
    .eq("id", body.orderId)
    .single();
  if (!o) throw new HttpError(404, "Sipariş bulunamadı");
  if (o.customer_id !== user.id) {
    const { data: p } = await ctx.admin.from("profiles").select("role").eq("id", user.id).single();
    if (p?.role !== "admin") throw new HttpError(403, "Yetkiniz yok");
  }
  if (o.status !== "iptal") throw new HttpError(409, "Önce sipariş iptal edilmeli");
  if (!["odendi", "iade_bekliyor"].includes(o.payment_status) || !o.payment_ref) {
    return json({ refunded: false, reason: "Kartla ödenmiş bir tutar yok" });
  }

  const cfg = iyzicoFromEnv(deps.env);
  try {
    if (!cfg) throw new Error("iyzico yapılandırılmamış");
    await cancelPayment(cfg, o.payment_ref, clientIp(req), deps.fetchFn);
    await ctx.admin.from("orders").update({ payment_status: "iade_edildi", payment_error: null }).eq("id", o.id);
    return json({ refunded: true });
  } catch (e) {
    // Aynı gün iptal yapılamazsa (ör. gün sonu geçtiyse) yönetici iyzico panelinden iade eder
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.admin.from("orders").update({ payment_status: "iade_bekliyor", payment_error: msg }).eq("id", o.id);
    return json({ refunded: false, reason: "İade yönetici tarafından tamamlanacak" });
  }
}
