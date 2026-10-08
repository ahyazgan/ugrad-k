import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { DEFAULT_MODEL, TOOLS, executeTool, runAssistantTurn, type ToolContext } from "../_shared/assistant.ts";
import { handleIncomingText } from "../_shared/conversation.ts";
import { hmacSha256Hex } from "../_shared/iyzico.ts";
import { extractMessages, handleVoiceTurn, handleWhatsAppWebhook, messageText, verifyMetaSignature } from "../_shared/whatsapp-webhook.ts";
import { fakeCtx } from "./fake.ts";

// ───────── Sahte Messages API: sıradaki yanıtları döner, istek gövdelerini kaydeder
// deno-lint-ignore no-explicit-any
type Json = any;
function fakeClaude(responses: Json[]) {
  const requests: Array<{ body: Json; headers: Headers }> = [];
  const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push({ body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
    const next = responses.shift();
    if (!next) throw new Error("beklenmeyen ek istek");
    return new Response(
      JSON.stringify({
        id: `msg_${requests.length}`,
        type: "message",
        role: "assistant",
        model: DEFAULT_MODEL,
        stop_sequence: null,
        stop_details: null,
        usage: { input_tokens: 10, output_tokens: 10 },
        ...next,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  const client = new Anthropic({ apiKey: "test", fetch: fetchFn, maxRetries: 0 });
  return { client, requests };
}

const thinking = { type: "thinking", thinking: "", signature: "sig-abc" };
const text = (t: string) => ({ stop_reason: "end_turn", content: [thinking, { type: "text", text: t }] });
const toolUse = (id: string, name: string, input: Json) => ({
  stop_reason: "tool_use",
  content: [thinking, { type: "tool_use", id, name, input }],
});

function toolCtx(tables: Record<string, Json> = {}): ToolContext {
  const { ctx } = fakeCtx({ tables });
  return { ctx, customer: { profileId: "u1", phone: "905321112233" }, trackingBaseUrl: "https://t", channel: "whatsapp", handoff: null };
}

Deno.test("asistan: araç tanımları katı şemalı ve kararlı", () => {
  for (const t of TOOLS) {
    assertEquals(t.strict, true, t.name);
    assertEquals((t.input_schema as Json).additionalProperties, false, t.name);
    const props = Object.keys((t.input_schema as Json).properties);
    assertEquals([...(t.input_schema as Json).required].sort(), props.sort(), `${t.name}: tüm alanlar required`);
  }
});

Deno.test("asistan: fiyat aracı döngüsü, istek biçimi ve sona ekleme", async () => {
  const { client, requests } = fakeClaude([
    toolUse("tu1", "get_price_quote", {
      pickup_place_id: "mock-beykoz",
      dropoff_place_id: "mock-levent",
      service_level: "acil",
      round_trip: false,
      weight_kg: null,
      large_package: false,
    }),
    text("Beykoz → Levent acil teslimat KDV dahil 1.662,00 TL."),
  ]);
  const tc = toolCtx();
  const history: Json[] = [{ role: "user", content: "merhaba" }, { role: "assistant", content: [thinking, { type: "text", text: "Merhaba!" }] }];
  const r = await runAssistantTurn(client, history, "Beykoz'dan Levent'e acil ne kadar?", tc, { kvkkUrl: "https://k" });

  assert(r.reply.includes("1.662,00 TL"));
  assertEquals(requests.length, 2);
  const first = requests[0]!.body;
  assertEquals(first.model, "claude-opus-5-5");
  assertEquals(first.fallbacks, "default");
  assertEquals(first.thinking, { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } });
  assertEquals(first.tool_choice, undefined); // zorlanmış araç seçimi yok
  const betas = requests[0]!.headers.get("anthropic-beta") ?? "";
  assert(betas.includes("server-side-fallback-2026-07-01") && betas.includes("thinking-binding-controls-2026-08-01"));

  // İkinci istek, ilkinin mesajlarını aynen önek olarak taşımalı (geçmiş düzenlenmez)
  const second = requests[1]!.body;
  assertEquals(second.messages.slice(0, first.messages.length), first.messages);
  assertEquals(second.system, first.system);
  assertEquals(second.tools, first.tools);
  // Düşünme bloğu değiştirilmeden geri gönderildi
  assertEquals(second.messages[3].content[0], thinking);
  const toolResult = JSON.parse(second.messages[4].content[0].content);
  assertEquals(toolResult.total_incl_vat.endsWith("TL"), true);

  // Eklenenler: kullanıcı, asistan(tool_use), kullanıcı(tool_result), asistan(metin)
  assertEquals(r.appended.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
  assertEquals(r.handoff, null);
});

Deno.test("asistan: ret (refusal) → temsilciye devir", async () => {
  const { client } = fakeClaude([{ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "" }, content: [] }]);
  const r = await runAssistantTurn(client, [], "...", toolCtx(), { kvkkUrl: "k" });
  assert(r.handoff);
  assert(r.reply.includes("temsilci"));
});

Deno.test("asistan: araç hatası is_error ile modele döner", async () => {
  const { client, requests } = fakeClaude([
    toolUse("tu1", "get_price_quote", {
      pickup_place_id: "yok",
      dropoff_place_id: "mock-levent",
      service_level: "standart",
      round_trip: false,
      weight_kg: null,
      large_package: false,
    }),
    text("Adresi bulamadım, tekrar yazar mısınız?"),
  ]);
  await runAssistantTurn(client, [], "fiyat", toolCtx(), { kvkkUrl: "k" });
  const tr = requests[1]!.body.messages[2].content[0];
  assertEquals(tr.is_error, true);
});

Deno.test("araçlar: KVKK onayı olmadan sipariş oluşturulmaz", async () => {
  const tc = toolCtx({ profiles: [{ id: "u1", role: "musteri", corporate_account_id: null }], current_consents: [] });
  let err = "";
  try {
    await executeTool(
      "create_order",
      {
        pickup_place_id: "mock-beykoz",
        pickup_details: "Kat 2",
        pickup_contact_name: "Ayşe",
        pickup_contact_phone: "05321112233",
        dropoff_place_id: "mock-kadikoy",
        dropoff_details: null,
        dropoff_contact_name: "Ali",
        dropoff_contact_phone: "05334445566",
        package_description: "Evrak",
        service_level: "standart",
        round_trip: false,
        weight_kg: null,
        large_package: false,
        payment_method: "nakit",
        customer_note: null,
      },
      tc,
    );
  } catch (e) {
    err = (e as Error).message;
  }
  assert(err.includes("KVKK"));
});

Deno.test("araçlar: onay kaydı, sipariş ve durum", async () => {
  const tables: Record<string, Json> = {
    profiles: [{ id: "u1", role: "musteri", corporate_account_id: null }],
    current_consents: [
      { profile_id: "u1", consent_type: "kvkk_aydinlatma", granted: true },
      { profile_id: "u1", consent_type: "acik_riza_konum", granted: true },
    ],
  };
  const { ctx, inserted } = fakeCtx({ tables });
  const tc: ToolContext = { ctx, customer: { profileId: "u1", phone: "905321112233" }, trackingBaseUrl: "https://t/takip", channel: "whatsapp", handoff: null };

  const consent = (await executeTool("record_kvkk_consent", { accepted: true }, tc)) as Json;
  assertEquals(consent.recorded, true);
  assertEquals(inserted.consents!.length, 2);
  assertEquals(inserted.consents![0]!.user_agent, "assistant:whatsapp");

  const order = (await executeTool(
    "create_order",
    {
      pickup_place_id: "mock-beykoz",
      pickup_details: "Kat 2",
      pickup_contact_name: "Ayşe",
      pickup_contact_phone: "05321112233",
      dropoff_place_id: "mock-kadikoy",
      dropoff_details: "Resepsiyon",
      dropoff_contact_name: "Ali",
      dropoff_contact_phone: "05334445566",
      package_description: "Evrak",
      service_level: "standart",
      round_trip: false,
      weight_kg: null,
      large_package: false,
      payment_method: "nakit",
      customer_note: null,
    },
    tc,
  )) as Json;
  assertEquals(order.order_no, "YK-1000");
  assert(order.tracking_url.startsWith("https://t/takip/"));
  const row = inserted.orders![0]!;
  assertEquals(row.customer_id, "u1");
  assertEquals(row.pickup_contact_name, "Ayşe");
  assertEquals(row.payment_method, "nakit");
  assertEquals(row.service_level, "standart");
  assertEquals(row.urgent, false);

  // Eski konuşmadaki araç çağrısı (yalnız urgent) hâlâ çalışır
  const legacy = (await executeTool(
    "get_price_quote",
    { pickup_place_id: "mock-beykoz", dropoff_place_id: "mock-levent", urgent: true, round_trip: false, weight_kg: null, large_package: false },
    tc,
  )) as Json;
  assert(legacy.lines.some((l: string) => l.startsWith("Acil")));

  const handoff = (await executeTool("handoff_to_human", { reason: "hasar" }, tc)) as Json;
  assertEquals(handoff.handed_off, true);
  assertEquals(tc.handoff, { reason: "hasar" });
});

Deno.test("konuşma: ilk mesaja müşteri bağlamı eklenir, geçmiş sona eklenir", async () => {
  const { client, requests } = fakeClaude([text("Merhaba Ayşe Hanım, nasıl yardımcı olabilirim?")]);
  const { ctx, rpcCalls } = fakeCtx({
    tables: {
      assistant_conversations: [],
      current_consents: [],
      profiles: [{ id: "u1", corporate_account_id: null }],
      "rpc:lock_conversation": true,
      "rpc:append_conversation": null,
    },
  });
  const r = await handleIncomingText(
    {
      ctx,
      client,
      env: (k) => ({ ADMIN_ALERT_PHONES: "" })[k],
      findOrCreateCustomer: () => Promise.resolve({ profileId: "u1", fullName: "Ayşe Yılmaz", isNew: false }),
    },
    "whatsapp",
    "905321112233",
    "905321112233",
    "merhaba",
  );
  assert(r.reply.startsWith("Merhaba"));
  const firstUser = requests[0]!.body.messages[0].content as string;
  assert(firstUser.includes("Ad: Ayşe Yılmaz"));
  assert(firstUser.includes("KVKK onayı: YOK"));
  assert(firstUser.endsWith("merhaba"));
  const append = rpcCalls.find((c) => c.name === "append_conversation")!;
  assertEquals((append.args.p_messages as Json[]).length, 2);
});

Deno.test("WhatsApp: imza doğrulama", async () => {
  const body = '{"a":1}';
  const sig = `sha256=${await hmacSha256Hex("app-secret", body)}`;
  assertEquals(await verifyMetaSignature(body, sig, "app-secret"), true);
  assertEquals(await verifyMetaSignature(body, sig, "baska"), false);
  assertEquals(await verifyMetaSignature(body, null, "app-secret"), false);
});

Deno.test("WhatsApp: mesaj ayrıştırma", () => {
  const payload = {
    entry: [{ changes: [{ value: { messages: [
      { id: "m1", from: "905", type: "text", text: { body: "selam" } },
      { id: "m2", from: "905", type: "location", location: { latitude: 41.1, longitude: 29.1, name: "Ofis" } },
      { id: "m3", from: "905", type: "image" },
    ] } }] }],
  };
  const ms = extractMessages(payload);
  assertEquals(ms.length, 3);
  assertEquals(messageText(ms[0]!), "selam");
  assertEquals(messageText(ms[1]!), "Konumumu paylaştım: Ofis");
  assertEquals(messageText(ms[2]!), null);
});

Deno.test("WhatsApp webhook: GET doğrulama, imzasız POST 401, tekrar mesaj işlenmez", async () => {
  const env = (k: string) => ({ WHATSAPP_VERIFY_TOKEN: "vt", WHATSAPP_APP_SECRET: "app-secret" })[k];
  const { ctx } = fakeCtx({ tables: { assistant_inbound: [] } });
  const { client } = fakeClaude([]);
  const deps = { ctx, client, env };

  const ok = await handleWhatsAppWebhook(new Request("http://x/?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=42"), deps);
  assertEquals(await ok.text(), "42");
  const bad = await handleWhatsAppWebhook(new Request("http://x/?hub.mode=subscribe&hub.verify_token=no&hub.challenge=42"), deps);
  assertEquals(bad.status, 403);

  const unsigned = await handleWhatsAppWebhook(new Request("http://x", { method: "POST", body: "{}" }), deps);
  assertEquals(unsigned.status, 401);

  // Desteklenmeyen tür → Claude çağrılmadan yanıt; aynı id ikinci kez işlenmez
  const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "m9", from: "905321112233", type: "image" }] } }] }] });
  const headers = { "x-hub-signature-256": `sha256=${await hmacSha256Hex("app-secret", body)}` };
  const sent: string[] = [];
  const fetchFn = ((_u: string, init: RequestInit) => {
    sent.push(String(init.body));
    return Promise.resolve(Response.json({}));
  }) as unknown as typeof fetch;
  const envSend = (k: string) =>
    ({ WHATSAPP_VERIFY_TOKEN: "vt", WHATSAPP_APP_SECRET: "app-secret", WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1" })[k];
  for (let i = 0; i < 2; i++) {
    const res = await handleWhatsAppWebhook(new Request("http://x", { method: "POST", body, headers }), { ...deps, env: envSend, fetchFn });
    assertEquals(res.status, 200);
  }
  assertEquals(sent.length, 1);
  assert(sent[0]!.includes("yazılı mesajları"));
});

Deno.test("sesli ağ geçidi: gizli anahtar ve alan kontrolü", async () => {
  const { ctx } = fakeCtx();
  const { client } = fakeClaude([]);
  const env = (k: string) => ({ VOICE_GATEWAY_SECRET: "vs" })[k];
  const no = await handleVoiceTurn(new Request("http://x", { method: "POST", body: "{}" }), { ctx, client, env });
  assertEquals(no.status, 401);
  const missing = await handleVoiceTurn(
    new Request("http://x", { method: "POST", body: JSON.stringify({ session_id: "c1" }), headers: { "x-voice-secret": "vs" } }),
    { ctx, client, env },
  );
  assertEquals(missing.status, 400);
});
