// Bildirim kanalları. Yapılandırılmamış kanal "dryRun" döner (gönderim yapılmaz, loglanır).
import type { OutboundMessage } from "../../../packages/shared/index.ts";
import { normalizeTrMobile, sendSms } from "./netgsm.ts";

export type Env = (k: string) => string | undefined;

export interface DeliveryResult {
  role: string;
  channel: "push" | "whatsapp" | "sms" | "none";
  ok: boolean;
  dryRun?: boolean;
  error?: string;
}

export async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  opts: { env: Env; fetchFn?: typeof fetch },
): Promise<{ ok: boolean; error?: string }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const access = opts.env("EXPO_ACCESS_TOKEN");
  if (access) headers.Authorization = `Bearer ${access}`;
  const res = await fetchFn("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers,
    body: JSON.stringify([{ to: token, title, body, sound: "default", priority: "high" }]),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: Array<{ status: string; message?: string }> };
  const r = json.data?.[0];
  if (!res.ok || r?.status !== "ok") return { ok: false, error: r?.message ?? `HTTP ${res.status}` };
  return { ok: true };
}

export async function sendWhatsAppTemplate(
  phone: string,
  template: { name: string; params: string[] },
  opts: { env: Env; fetchFn?: typeof fetch },
): Promise<{ ok: boolean; dryRun?: boolean; error?: string }> {
  const token = opts.env("WHATSAPP_TOKEN");
  const phoneId = opts.env("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneId) return { ok: true, dryRun: true };
  const version = opts.env("WHATSAPP_API_VERSION") ?? "v23.0";
  const res = await (opts.fetchFn ?? fetch)(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: `90${normalizeTrMobile(phone)}`,
      type: "template",
      template: {
        name: template.name,
        language: { code: "tr" },
        components: [{ type: "body", parameters: template.params.map((text) => ({ type: "text", text })) }],
      },
    }),
  });
  if (!res.ok) return { ok: false, error: `WhatsApp HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
  return { ok: true };
}

const whatsappConfigured = (env: Env) => !!env("WHATSAPP_TOKEN") && !!env("WHATSAPP_PHONE_NUMBER_ID");
const smsConfigured = (env: Env) => !!env("NETGSM_USERCODE") && !!env("NETGSM_PASSWORD") && !!env("NETGSM_HEADER");

/**
 * Mesajı tercih sırasındaki ilk uygun kanaldan gönderir; hata olursa sonraki kanala düşer.
 * Hiçbir kanal yapılandırılmamışsa son uygun kanalda deneme modu (dryRun) sonucu döner.
 */
export async function deliver(m: OutboundMessage, opts: { env: Env; fetchFn?: typeof fetch }): Promise<DeliveryResult> {
  const role = m.to.role;
  let lastError: string | undefined;
  let dryRunCandidate: DeliveryResult | null = null;

  for (const channel of m.channels) {
    try {
      if (channel === "push" && m.to.pushToken) {
        const r = await sendExpoPush(m.to.pushToken, m.title, m.text, opts);
        if (r.ok) return { role, channel, ok: true };
        lastError = r.error;
      } else if (channel === "whatsapp" && m.to.phone && m.whatsappTemplate) {
        if (!whatsappConfigured(opts.env)) {
          dryRunCandidate ??= { role, channel, ok: true, dryRun: true };
          continue;
        }
        const r = await sendWhatsAppTemplate(m.to.phone, m.whatsappTemplate, opts);
        if (r.ok) return { role, channel, ok: true };
        lastError = r.error;
      } else if (channel === "sms" && m.to.phone) {
        if (!smsConfigured(opts.env)) {
          console.warn(`[bildirim deneme modu] ${role} ${m.to.phone}: ${m.text}`);
          dryRunCandidate = { role, channel, ok: true, dryRun: true };
          continue;
        }
        const r = await sendSms(m.to.phone, m.text, { env: opts.env, fetchFn: opts.fetchFn });
        if (r.sent) return { role, channel, ok: true };
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  if (dryRunCandidate && !lastError) return dryRunCandidate;
  return { role, channel: "none", ok: false, error: lastError ?? "Uygun kanal yok" };
}
