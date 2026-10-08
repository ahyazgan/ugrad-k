// Kanal bağımsız konuşma yönetimi: müşteri eşleştirme, konuşma kaydı, kilit, asistan turu.
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { runAssistantTurn, type AssistantCustomer, type AssistantOptions, type ToolContext } from "./assistant.ts";
import { deliver, type Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { notificationConfig } from "./dispatch.ts";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;

const IDLE_HOURS = 6;
const MAX_MESSAGES = 80;

export interface ConversationDeps {
  ctx: Ctx;
  client: Anthropic;
  env: Env;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Telefon numarasından müşteri profili (yoksa oluşturur) */
  findOrCreateCustomer?: (phone: string) => Promise<{ profileId: string; fullName: string | null; isNew: boolean }>;
}

export { findOrCreateCustomerDefault, phoneKey } from "./customers.ts";
import { findOrCreateCustomerDefault } from "./customers.ts";

async function customerContext(ctx: Ctx, profileId: string, fullName: string | null, isNew: boolean) {
  const [{ data: consents }, { data: profile }] = await Promise.all([
    ctx.admin.from("current_consents").select("consent_type, granted").eq("profile_id", profileId),
    ctx.admin.from("profiles").select("corporate_account_id").eq("id", profileId).single(),
  ]);
  const ok = new Set(((consents ?? []) as Array<{ consent_type: string; granted: boolean }>).filter((c) => c.granted).map((c) => c.consent_type));
  const kvkk = ok.has("kvkk_aydinlatma") && ok.has("acik_riza_konum");
  return (
    `[Müşteri bilgisi — sistem tarafından eklendi] ` +
    `Ad: ${fullName ?? "bilinmiyor"}; ${isNew ? "yeni müşteri" : "kayıtlı müşteri"}; ` +
    `KVKK onayı: ${kvkk ? "var" : "YOK"}; kurumsal (cari) hesap: ${profile?.corporate_account_id ? "var" : "yok"}.`
  );
}

export async function handleIncomingText(
  deps: ConversationDeps,
  channel: "whatsapp" | "voice" | "app",
  externalId: string,
  phone: string,
  text: string,
): Promise<{ reply: string; handoff: boolean }> {
  const { ctx } = deps;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const customer = await (deps.findOrCreateCustomer ?? ((p: string) => findOrCreateCustomerDefault(ctx, p)))(phone);

  // Aktif konuşmayı bul; uzun süre sessizse veya çok uzadıysa yenisini aç
  const since = new Date(Date.now() - IDLE_HOURS * 3600_000).toISOString();
  const { data: found } = await ctx.admin
    .from("assistant_conversations")
    .select("id, messages, status")
    .eq("channel", channel)
    .eq("external_id", externalId)
    .gte("last_message_at", since)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let conv = found as { id: string; messages: MessageParam[]; status: string } | null;
  if (conv && (conv.status === "closed" || conv.messages.length >= MAX_MESSAGES)) {
    await ctx.admin.from("assistant_conversations").update({ status: "closed" }).eq("id", conv.id);
    conv = null;
  }
  if (!conv) {
    const { data, error } = await ctx.admin
      .from("assistant_conversations")
      .insert({ channel, external_id: externalId, profile_id: customer.profileId })
      .select("id, messages, status")
      .single();
    if (error || !data) throw new Error(`Konuşma açılamadı: ${error?.message}`);
    conv = data as typeof conv & object;
  }

  // Aynı konuşmadaki mesajları sırayla işle
  let locked = false;
  for (let i = 0; i < 20 && !locked; i++) {
    const { data } = await ctx.admin.rpc("lock_conversation", { p_id: conv!.id });
    locked = data === true;
    if (!locked) await sleep(1500);
  }
  if (!locked) return { reply: "Bir önceki mesajınızı işliyorum, birazdan yanıt vereceğim.", handoff: false };

  // Geçmiş kilit alındıktan sonra yeniden okunur (başka işlem eklemiş olabilir)
  const { data: fresh } = await ctx.admin.from("assistant_conversations").select("messages").eq("id", conv!.id).single();
  const history = ((fresh?.messages ?? conv!.messages) as MessageParam[]) ?? [];
  const cfg = notificationConfig(deps.env);
  const tc: ToolContext = {
    ctx,
    customer: { profileId: customer.profileId, phone } satisfies AssistantCustomer,
    trackingBaseUrl: cfg.trackingBaseUrl,
    channel,
    handoff: null,
  };
  const userText =
    history.length === 0 ? `${await customerContext(ctx, customer.profileId, customer.fullName, customer.isNew)}\n\n${text}` : text;
  const opts: AssistantOptions = {
    model: deps.env("ASSISTANT_MODEL") || undefined,
    effort: (deps.env("ASSISTANT_EFFORT") as AssistantOptions["effort"]) || undefined,
    kvkkUrl: deps.env("KVKK_URL") ?? "https://yazgankurye.com/kvkk",
  };

  try {
    const result = await runAssistantTurn(deps.client, history, userText, tc, opts);
    await ctx.admin.rpc("append_conversation", {
      p_id: conv!.id,
      p_messages: result.appended,
      p_status: result.handoff ? "handoff" : null,
      p_handoff_reason: result.handoff?.reason ?? null,
    });
    if (result.handoff) {
      // Yöneticiye haber ver (WhatsApp → SMS)
      await Promise.all(
        cfg.adminPhones.map((admin) =>
          deliver(
            {
              to: { role: "admin", phone: admin },
              channels: ["whatsapp", "sms"],
              title: "Temsilci gerekli",
              text: `Asistan devretti (${channel} ${phone}): ${result.handoff!.reason}`,
              whatsappTemplate: { name: "yonetici_uyari", params: [`Asistan devretti: ${phone}`] },
            },
            { env: deps.env, fetchFn: deps.fetchFn },
          ),
        ),
      );
    }
    return { reply: result.reply, handoff: !!result.handoff };
  } catch (e) {
    console.error("asistan hatası", e);
    // Hiçbir şey eklenmez; yalnızca kilit bırakılır (geçmiş tutarlı kalır)
    await ctx.admin.from("assistant_conversations").update({ locked_at: null }).eq("id", conv!.id);
    return { reply: "Şu an yanıt veremiyorum, lütfen birkaç dakika sonra tekrar yazın.", handoff: false };
  }
}
