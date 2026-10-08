// WhatsApp Cloud API gelen mesaj webhook'u → yapay zeka asistanı → WhatsApp yanıtı.
import { sendWhatsAppText, type Env } from "./channels.ts";
import { handleIncomingText, type ConversationDeps } from "./conversation.ts";
import { hmacSha256Hex } from "./iyzico.ts";

interface WaMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

/** Meta imzası: X-Hub-Signature-256 = "sha256=" + HMAC(app secret, ham gövde) */
export async function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = await hmacSha256Hex(appSecret, rawBody);
  const got = header.slice(7);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function extractMessages(payload: unknown): WaMessage[] {
  const out: WaMessage[] = [];
  // deno-lint-ignore no-explicit-any
  for (const entry of (payload as any)?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const m of change?.value?.messages ?? []) out.push(m as WaMessage);
    }
  }
  return out;
}

/** Mesajı asistanın anlayacağı metne çevirir (desteklenmeyen türler için null) */
export function messageText(m: WaMessage): string | null {
  if (m.type === "text" && m.text?.body) return m.text.body.slice(0, 2000);
  if (m.type === "location" && m.location) {
    const label = [m.location.name, m.location.address].filter(Boolean).join(", ");
    return `Konumumu paylaştım: ${label || `${m.location.latitude}, ${m.location.longitude}`}`;
  }
  return null;
}

export async function handleWhatsAppWebhook(
  req: Request,
  deps: ConversationDeps & { waitUntil?: (p: Promise<unknown>) => void },
): Promise<Response> {
  const env: Env = deps.env;
  const url = new URL(req.url);

  // Meta abonelik doğrulaması
  if (req.method === "GET") {
    const ok =
      url.searchParams.get("hub.mode") === "subscribe" &&
      !!env("WHATSAPP_VERIFY_TOKEN") &&
      url.searchParams.get("hub.verify_token") === env("WHATSAPP_VERIFY_TOKEN");
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  const secret = env("WHATSAPP_APP_SECRET");
  if (!secret || !(await verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), secret))) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const work = (async () => {
    for (const m of extractMessages(payload)) {
      // Aynı mesaj tekrar gelirse işleme
      const { error: dup } = await deps.ctx.admin.from("assistant_inbound").insert({ message_id: m.id });
      if (dup) continue;
      const text = messageText(m);
      const reply = text
        ? (await handleIncomingText(deps, "whatsapp", m.from, m.from, text)).reply
        : "Şimdilik yalnızca yazılı mesajları ve konumu anlayabiliyorum. Lütfen adresinizi yazar mısınız?";
      await sendWhatsAppText(m.from, reply, { env, fetchFn: deps.fetchFn });
    }
  })().catch((e) => console.error("whatsapp işleme hatası", e));

  // Meta'ya hemen 200 dön; işleme arka planda sürsün
  if (deps.waitUntil) deps.waitUntil(work);
  else await work;
  return new Response("ok", { status: 200 });
}

/**
 * Sesli asistan ağ geçidi: konuşmayı metne çeviren bir telefon servisi (ör. Twilio
 * ConversationRelay, Netgsm sesli yanıt) her konuşma parçasını buraya gönderir,
 * dönen metni sese çevirir. Başlık: x-voice-secret.
 */
export async function handleVoiceTurn(req: Request, deps: ConversationDeps): Promise<Response> {
  const secret = deps.env("VOICE_GATEWAY_SECRET");
  if (!secret || req.headers.get("x-voice-secret") !== secret) return Response.json({ error: "Yetkisiz" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { session_id?: string; caller?: string; text?: string } | null;
  if (!body?.session_id || !body.caller || !body.text?.trim()) {
    return Response.json({ error: "session_id, caller ve text gerekli" }, { status: 400 });
  }
  const r = await handleIncomingText(deps, "voice", body.session_id, body.caller, body.text.trim().slice(0, 2000));
  return Response.json({ reply: r.reply, transfer_to_human: r.handoff });
}
