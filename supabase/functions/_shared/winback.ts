// Geri kazanma: bir süredir sipariş vermeyen, ticari ileti onayı olan müşteriye kişiye özel kampanya kodu.
// Günlük cron (x-notify-secret). ops_settings.winback_enabled kapalıyken hiçbir şey göndermez.
// Ticari elektronik ileti: İYS'ye kayıt ve müşterinin onayı (consents.ticari_ileti) şarttır.
import { BRAND } from "../../../packages/shared/index.ts";
import { deliver, type Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { HttpError, json } from "./http.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const WINBACK_VALID_DAYS = 14;

const randomCode = () =>
  "TEKRAR" + Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ALPHABET[b % ALPHABET.length]).join("");

export async function handleWinback(req: Request, ctx: Ctx, deps: { env: Env; fetchFn?: typeof fetch; now?: Date }): Promise<Response> {
  const secret = deps.env("NOTIFY_SECRET");
  if (!secret || req.headers.get("x-notify-secret") !== secret) throw new HttpError(401, "Yetkisiz");
  await ctx.admin.rpc("record_heartbeat", { p_name: "winback" });
  const now = deps.now ?? new Date();
  const { data: ops } = await ctx.admin.from("ops_settings").select("winback_enabled, winback_after_days, winback_discount_pct").eq("id", 1).single();
  if (!(ops as Row | null)?.winback_enabled) return json({ enabled: false, sent: 0 });
  const pct = Number((ops as Row).winback_discount_pct);
  const { data: candidates } = await ctx.admin.rpc("winback_candidates", { p_after_days: (ops as Row).winback_after_days, p_limit: 100 });
  let sent = 0;
  for (const c of (candidates ?? []) as Row[]) {
    const code = randomCode();
    const validUntil = new Date(now.getTime() + WINBACK_VALID_DAYS * 86_400_000);
    const { error } = await ctx.admin.from("promo_codes").insert({
      code,
      description: "Geri kazanma",
      kind: "yuzde",
      value: pct,
      valid_until: validUntil.toISOString(),
      max_redemptions: 1,
      per_customer_limit: 1,
      customer_id: c.id,
      source: "geri_kazanma",
    });
    if (error) continue;
    const name = String(c.full_name ?? "").trim().split(/\s+/)[0] || "";
    const until = validUntil.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long" });
    const text =
      `${name ? `Merhaba ${name}, ` : ""}sizi özledik! ${BRAND.name} ile sonraki gönderinizde %${pct} indirim: ${code} ` +
      `(${until} tarihine kadar, uygulamada veya WhatsApp'tan sipariş verirken). Mesaj almak istemiyorsanız RET yazın.`;
    await deliver(
      {
        to: { role: "customer", phone: c.phone, pushToken: c.push_token },
        channels: ["push", "whatsapp", "sms"],
        title: "Size özel indirim",
        text,
        whatsappTemplate: { name: "geri_kazanma", params: [name || "Değerli müşterimiz", `%${pct}`, code] },
      },
      deps,
    ).catch((e) => console.error("geri kazanma mesajı", e));
    await ctx.admin.from("profiles").update({ last_winback_at: now.toISOString() }).eq("id", c.id);
    sent++;
  }
  return json({ enabled: true, sent });
}
