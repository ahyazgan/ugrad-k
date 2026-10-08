import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { DEFAULT_MODEL } from "../_shared/assistant.ts";
import { handleEmailInbound, parsePostmarkInbound, stripQuoted } from "../_shared/email-orders.ts";
import { fakeCtx } from "./fake.ts";

// deno-lint-ignore no-explicit-any
type Json = any;

function fakeClaude(replies: string[]) {
  const requests: Json[] = [];
  const fetchFn = (async (_u: string | URL | Request, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    const t = replies.shift();
    if (t == null) throw new Error("beklenmeyen istek");
    return Response.json({
      id: `msg_${requests.length}`,
      type: "message",
      role: "assistant",
      model: DEFAULT_MODEL,
      stop_reason: "end_turn",
      stop_sequence: null,
      stop_details: null,
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: t }],
    });
  }) as typeof fetch;
  return { client: new Anthropic({ apiKey: "t", fetch: fetchFn, maxRetries: 0 }), requests };
}

const inbound = (over: Json = {}) => ({
  MessageID: "m-1",
  From: "avukat@ornek-hukuk.com",
  FromFull: { Email: "Avukat@Ornek-Hukuk.com", Name: "Av. Murat" },
  Subject: "Acil evrak",
  TextBody: "Yarın 10:00'da Beykoz'dan Levent'e sözleşme gidecek.\n\nOn Tue, X wrote:\n> eski mesaj",
  StrippedTextReply: "",
  Headers: [{ Name: "Received-SPF", Value: "Pass (sender SPF authorized)" }],
  ...over,
});

const req = (body: Json, auth = "Basic " + btoa("postmark:gizli")) =>
  new Request("http://x/email-inbound", { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });

function setup(profiles: Json[] = [{ id: "u1", full_name: "Av. Murat Demir", phone: "905334445566", role: "musteri", email: "avukat@ornek-hukuk.com", deleted_at: null }]) {
  const sent: Json[] = [];
  const fetchFn = ((url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) });
    return Promise.resolve(Response.json({ MessageID: "out" }));
  }) as unknown as typeof fetch;
  const f = fakeCtx({
    tables: {
      profiles,
      assistant_conversations: [],
      current_consents: [],
      "rpc:lock_conversation": true,
      "rpc:append_conversation": null,
      "rpc:hit_rate_limit": () => true,
    },
  });
  const env = (k: string) => ({ EMAIL_INBOUND_SECRET: "gizli", POSTMARK_SERVER_TOKEN: "pm", ADMIN_ALERT_PHONES: "" } as Record<string, string>)[k];
  return { ...f, sent, fetchFn, env };
}

Deno.test("e-posta: alıntılar ve imza ayıklanır", () => {
  assertEquals(stripQuoted("Merhaba\nKadıköy'den alınacak\n\n12 Eki 2026 Pzt 10:00 tarihinde X şunu yazdı:\n> eski"), "Merhaba\nKadıköy'den alınacak");
  assertEquals(stripQuoted("Tamam\n-- \nAv. Murat\nTel"), "Tamam");
  assertEquals(stripQuoted("Onay\n-----Original Message-----\nFrom: a"), "Onay");
});

Deno.test("e-posta: SPF/DKIM doğrulaması", () => {
  assertEquals(parsePostmarkInbound(inbound())!.authenticated, true);
  assertEquals(parsePostmarkInbound(inbound())!.fromEmail, "avukat@ornek-hukuk.com");
  const dkim = inbound({ Headers: [{ Name: "Authentication-Results", Value: "mx; dkim=pass header.d=ornek-hukuk.com; spf=fail" }] });
  assertEquals(parsePostmarkInbound(dkim)!.authenticated, true);
  const otherDomain = inbound({ Headers: [{ Name: "Authentication-Results", Value: "mx; dkim=pass header.d=kotu.example; spf=fail" }] });
  assertEquals(parsePostmarkInbound(otherDomain)!.authenticated, false);
  assertEquals(parsePostmarkInbound(inbound({ Headers: [] }))!.authenticated, false);
});

Deno.test("e-posta: yetkisiz webhook 401", async () => {
  const s = setup();
  const { client } = fakeClaude([]);
  const res = await handleEmailInbound(req(inbound(), "Basic " + btoa("x:yanlis")), { ctx: s.ctx, client, env: s.env, fetchFn: s.fetchFn });
  assertEquals(res.status, 401);
});

Deno.test("e-posta: kayıtlı müşteri → asistan yanıtı aynı konuya gider", async () => {
  const s = setup();
  const { client, requests } = fakeClaude(["Merhaba Murat Bey, alış ve teslim adresinin tarifini paylaşır mısınız?"]);
  const res = await handleEmailInbound(req(inbound()), { ctx: s.ctx, client, env: s.env, fetchFn: s.fetchFn });
  assertEquals((await res.json()).result, "yanıtlandı");
  const firstUser = requests[0].messages[0].content as string;
  assert(firstUser.includes("[Kanal: e-posta."));
  assert(firstUser.endsWith("Konu: Acil evrak\n\nYarın 10:00'da Beykoz'dan Levent'e sözleşme gidecek."));
  const mail = s.sent[0]!;
  assertEquals(mail.url, "https://api.postmarkapp.com/email");
  assertEquals(mail.body.To, "avukat@ornek-hukuk.com");
  assertEquals(mail.body.Subject, "Re: Acil evrak");
  assert(mail.body.TextBody.startsWith("Merhaba Murat Bey"));
  assertEquals(mail.body.Headers[0], { Name: "In-Reply-To", Value: "m-1" });
  // Aynı ileti tekrar gelirse işlenmez
  const again = await handleEmailInbound(req(inbound()), { ctx: s.ctx, client, env: s.env, fetchFn: s.fetchFn });
  assertEquals((await again.json()).result, "tekrar");
});

Deno.test("e-posta: tanınmayan, doğrulanmamış ve otomatik yanıtlar asistanı çalıştırmaz", async () => {
  const { client, requests } = fakeClaude([]);
  const unknown = setup([]);
  assertEquals((await (await handleEmailInbound(req(inbound()), { ctx: unknown.ctx, client, env: unknown.env, fetchFn: unknown.fetchFn })).json()).result, "tanınmadı");
  assert(unknown.sent[0]!.body.TextBody.includes("eşleşmedi"));

  const spoof = setup();
  const r = await handleEmailInbound(req(inbound({ MessageID: "m-2", Headers: [{ Name: "Received-SPF", Value: "Fail" }] })), { ctx: spoof.ctx, client, env: spoof.env, fetchFn: spoof.fetchFn });
  assertEquals((await r.json()).result, "doğrulanamadı");

  const auto = setup();
  const a = await handleEmailInbound(req(inbound({ MessageID: "m-3", Headers: [{ Name: "Auto-Submitted", Value: "auto-replied" }] })), { ctx: auto.ctx, client, env: auto.env, fetchFn: auto.fetchFn });
  assertEquals((await a.json()).skipped, "otomatik yanıt");
  assertEquals(auto.sent.length, 0);
  assertEquals(requests.length, 0);
});
