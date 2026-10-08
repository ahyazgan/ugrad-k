// E-postayla sipariş: gelen e-posta (Postmark Inbound webhook) → yapay zeka asistanı → aynı konuya e-posta yanıtı.
// Güvenlik:
//  • Webhook gizli anahtarla korunur (EMAIL_INBOUND_SECRET: Basic Auth parolası veya ?token=).
//  • Gönderen alan adı SPF veya DKIM doğrulamasından geçmeli (sahte "Kimden" ile sipariş açılmasın).
//  • Yalnızca kayıtlı müşterinin e-postası işlenir; tanınmayan adrese yönlendirme yanıtı gider, asistan çalışmaz.
//  • Gönderen başına günlük sınır (yapay zeka maliyeti).
import { BRAND } from "../../../packages/shared/brand.ts";
import type { Env } from "./channels.ts";
import { handleIncomingText, type ConversationDeps } from "./conversation.ts";
import { rateLimit } from "./site.ts";

export const EMAIL_DAILY_LIMIT = 40;

export interface InboundEmail {
  messageId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  text: string;
  /** SPF/DKIM sonucu: gönderen alan adı doğrulandı mı */
  authenticated: boolean;
  /** Kendi gönderdiğimiz yanıtların döngüye girmemesi için */
  autoSubmitted: boolean;
}

// deno-lint-ignore no-explicit-any
type Json = any;

const header = (headers: Array<{ Name: string; Value: string }> | undefined, name: string) =>
  headers?.find((h) => h.Name.toLowerCase() === name.toLowerCase())?.Value ?? null;

/** Alıntılanmış önceki mesajları ve imza ayracını atar */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (
      /^-{2,}\s*(Original Message|Orijinal İleti|Özgün İleti)\s*-{2,}$/i.test(l) ||
      /^On .+ wrote:$/i.test(l) ||
      /tarihinde .+ şunu yazdı:$/i.test(l) ||
      (/^(From|Kimden|Gönderen):\s/i.test(l) && out.length > 0) ||
      l === "--" || l === "-- "
    ) {
      break;
    }
    if (l.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Postmark Inbound JSON → ortak biçim */
export function parsePostmarkInbound(p: Json): InboundEmail | null {
  const fromEmail = String(p?.FromFull?.Email ?? p?.From ?? "").trim().toLowerCase();
  if (!fromEmail.includes("@")) return null;
  const headers = p?.Headers as Array<{ Name: string; Value: string }> | undefined;
  const spf = header(headers, "Received-SPF") ?? "";
  const authResults = header(headers, "Authentication-Results") ?? "";
  const domain = fromEmail.split("@")[1]!;
  const dkimPass = new RegExp(`dkim=pass[^;]*header\\.d=(?:[\\w.-]+\\.)?${domain.replace(/\./g, "\\.")}`, "i").test(authResults);
  const spfPass = /^pass\b/i.test(spf.trim()) || /spf=pass/i.test(authResults);
  const raw = typeof p?.StrippedTextReply === "string" && p.StrippedTextReply.trim() ? p.StrippedTextReply : String(p?.TextBody ?? "");
  return {
    messageId: String(p?.MessageID ?? header(headers, "Message-ID") ?? ""),
    fromEmail,
    fromName: p?.FromFull?.Name || null,
    subject: String(p?.Subject ?? "").slice(0, 200),
    text: stripQuoted(raw).slice(0, 4000),
    authenticated: spfPass || dkimPass,
    autoSubmitted: /auto-(replied|generated)/i.test(header(headers, "Auto-Submitted") ?? "") || !!header(headers, "X-Autoreply"),
  };
}

export function inboundAuthorized(req: Request, env: Env): boolean {
  const secret = env("EMAIL_INBOUND_SECRET");
  if (!secret) return false;
  const url = new URL(req.url);
  if (url.searchParams.get("token") === secret) return true;
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Basic ")) {
    try {
      const [, pass] = atob(auth.slice(6)).split(":");
      return pass === secret;
    } catch {
      return false;
    }
  }
  return false;
}

/** Postmark ile e-posta gönderir (POSTMARK_SERVER_TOKEN yoksa deneme modunda yalnızca loglar) */
export async function sendEmail(
  m: { to: string; subject: string; text: string; inReplyTo?: string | null },
  opts: { env: Env; fetchFn?: typeof fetch },
): Promise<{ ok: boolean; dryRun?: boolean; error?: string }> {
  const token = opts.env("POSTMARK_SERVER_TOKEN");
  const from = opts.env("EMAIL_FROM") || `${BRAND.name} <${BRAND.email.orders}>`;
  if (!token) {
    console.warn(`[e-posta deneme modu] ${m.to}: ${m.subject}\n${m.text}`);
    return { ok: true, dryRun: true };
  }
  const headers = m.inReplyTo
    ? [
        { Name: "In-Reply-To", Value: m.inReplyTo },
        { Name: "References", Value: m.inReplyTo },
      ]
    : [];
  const res = await (opts.fetchFn ?? fetch)("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": token },
    body: JSON.stringify({
      From: from,
      To: m.to,
      Subject: m.subject,
      TextBody: m.text,
      Headers: [...headers, { Name: "Auto-Submitted", Value: "auto-replied" }],
      MessageStream: opts.env("POSTMARK_STREAM") || "outbound",
    }),
  });
  if (!res.ok) return { ok: false, error: `Postmark ${res.status}: ${(await res.text()).slice(0, 200)}` };
  return { ok: true };
}

const replySubject = (s: string) => (/^(re|ynt|yanıt):/i.test(s.trim()) ? s.trim() : `Re: ${s.trim() || `${BRAND.name} sipariş`}`);
const signature = `\n\n—\n${BRAND.name} sipariş asistanı\n${BRAND.siteUrl}`;

export async function handleEmailInbound(
  req: Request,
  deps: ConversationDeps & { waitUntil?: (p: Promise<unknown>) => void },
): Promise<Response> {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!inboundAuthorized(req, deps.env)) return new Response("unauthorized", { status: 401 });
  const payload = await req.json().catch(() => null);
  const mail = payload ? parsePostmarkInbound(payload) : null;
  if (!mail) return Response.json({ ok: true, skipped: "geçersiz" });
  if (mail.autoSubmitted) return Response.json({ ok: true, skipped: "otomatik yanıt" });
  const own = [BRAND.domain, ...(deps.env("EMAIL_OWN_DOMAINS") ?? "").split(",")].map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (own.includes(mail.fromEmail.split("@")[1]!)) return Response.json({ ok: true, skipped: "kendi alan adımız" });

  const { ctx } = deps;
  const reply = (text: string) =>
    sendEmail({ to: mail.fromEmail, subject: replySubject(mail.subject), text: text + signature, inReplyTo: mail.messageId || null }, deps);

  const work = (async () => {
    // Aynı e-posta tekrar gelirse işleme
    if (mail.messageId) {
      const { error: dup } = await ctx.admin.from("assistant_inbound").insert({ message_id: `email:${mail.messageId}` });
      if (dup) return "tekrar";
    }
    if (!mail.authenticated && deps.env("EMAIL_REQUIRE_AUTH") !== "false") {
      await reply(
        "Güvenliğiniz için e-postanızın gerçekten sizin adresinizden gönderildiğini doğrulayamadık (SPF/DKIM). " +
          `Siparişinizi mobil uygulamadan, ${BRAND.appUrl} adresinden veya WhatsApp'tan verebilirsiniz.`,
      );
      return "doğrulanamadı";
    }
    try {
      await rateLimit(ctx, `email:${mail.fromEmail}`, EMAIL_DAILY_LIMIT, 86_400);
    } catch {
      return "sınır";
    }
    const { data: matches } = await ctx.admin
      .from("profiles")
      .select("id, full_name, phone, role")
      // ilike joker karakterleri (_ %) kaçışlanır: tam adres eşleşmesi (büyük/küçük harf duyarsız)
      .ilike("email", mail.fromEmail.replace(/[\\%_]/g, "\\$&"))
      .is("deleted_at", null)
      .limit(2);
    const list = (matches ?? []) as Array<{ id: string; full_name: string | null; phone: string | null; role: string }>;
    const customer = list.length === 1 && list[0]!.role === "musteri" && list[0]!.phone ? list[0]! : null;
    if (!customer) {
      await reply(
        `Merhaba,\n\nBu e-posta adresi ${BRAND.name} müşteri kaydıyla eşleşmedi. E-postayla sipariş verebilmek için ` +
          `uygulamada (${BRAND.appUrl}) Hesabım bölümüne bu e-posta adresini ekleyin ya da kurumsal hesap için ${BRAND.siteUrl}/kurumsal sayfasından başvurun.`,
      );
      return "tanınmadı";
    }
    if (!mail.text) {
      await reply("E-postanızda metin bulamadık. Alış ve teslim adresini, gönderiyi ve alıcı bilgilerini yazar mısınız?");
      return "boş";
    }
    const r = await handleIncomingText(
      { ...deps, findOrCreateCustomer: () => Promise.resolve({ profileId: customer.id, fullName: customer.full_name, isNew: false }) },
      "email",
      mail.fromEmail,
      customer.phone!,
      mail.subject ? `Konu: ${mail.subject}\n\n${mail.text}` : mail.text,
    );
    const sent = await reply(r.reply);
    if (!sent.ok) console.error("e-posta yanıtı gönderilemedi", sent.error);
    return r.handoff ? "devredildi" : "yanıtlandı";
  })().catch((e) => {
    console.error("e-posta işleme hatası", e);
    return "hata";
  });

  if (deps.waitUntil) {
    deps.waitUntil(work);
    return Response.json({ ok: true });
  }
  return Response.json({ ok: true, result: await work });
}
