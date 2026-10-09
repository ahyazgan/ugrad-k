import { assertEquals } from "jsr:@std/assert@1";
import type { OutboundMessage } from "../../../packages/shared/index.ts";
import { deliver } from "../_shared/channels.ts";
import { handleNotifyDispatch } from "../_shared/dispatch.ts";
import { handler } from "../_shared/http.ts";
import { fakeCtx } from "./fake.ts";

const envOf = (vars: Record<string, string>) => (k: string) => vars[k];
const sms = { NETGSM_USERCODE: "u", NETGSM_PASSWORD: "p", NETGSM_HEADER: "YAZGAN" };

function recorder(responses: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchFn = ((url: string) => {
    calls.push(url);
    const host = Object.keys(responses).find((h) => url.includes(h))!;
    return Promise.resolve(Response.json(responses[host]));
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const msg = (over: Partial<OutboundMessage> = {}): OutboundMessage => ({
  to: { role: "customer", phone: "+905321112233", pushToken: "ExponentPushToken[a]" },
  channels: ["push", "sms"],
  title: "T",
  text: "Metin",
  ...over,
});

Deno.test("deliver: push başarılıysa SMS gönderilmez", async () => {
  const { calls, fetchFn } = recorder({ "exp.host": { data: [{ status: "ok" }] } });
  const r = await deliver(msg(), { env: envOf(sms), fetchFn });
  assertEquals(r, { role: "customer", channel: "push", ok: true });
  assertEquals(calls.length, 1);
});

Deno.test("deliver: push hatasında SMS'e düşer", async () => {
  const { calls, fetchFn } = recorder({
    "exp.host": { data: [{ status: "error", message: "DeviceNotRegistered" }] },
    "netgsm": { code: "00", jobid: "1" },
  });
  const r = await deliver(msg(), { env: envOf(sms), fetchFn });
  assertEquals(r.channel, "sms");
  assertEquals(calls.length, 2);
});

Deno.test("deliver: hiçbir kanal yapılandırılmamışsa deneme modu", async () => {
  const { calls, fetchFn } = recorder({});
  const r = await deliver(msg({ to: { role: "receiver", phone: "+905334445566" }, channels: ["whatsapp", "sms"], whatsappTemplate: { name: "x", params: [] } }), {
    env: envOf({}),
    fetchFn,
  });
  assertEquals(r, { role: "receiver", channel: "sms", ok: true, dryRun: true });
  assertEquals(calls.length, 0);
});

Deno.test("deliver: WhatsApp şablonu doğru gövdeyle gönderilir", async () => {
  let body: Record<string, unknown> = {};
  const fetchFn = ((_url: string, init: RequestInit) => {
    body = JSON.parse(init.body as string);
    return Promise.resolve(Response.json({ messages: [{ id: "w" }] }));
  }) as unknown as typeof fetch;
  const r = await deliver(
    msg({ to: { role: "receiver", phone: "0533 444 55 66" }, channels: ["whatsapp", "sms"], whatsappTemplate: { name: "alici_gonderi_yolda", params: ["Ali", "url"] } }),
    { env: envOf({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "123" }), fetchFn },
  );
  assertEquals(r.channel, "whatsapp");
  assertEquals(body.to, "905334445566");
  assertEquals((body.template as { name: string }).name, "alici_gonderi_yolda");
});

const orderRow = {
  id: "o1",
  order_no: "YK-1001",
  status: "beklemede",
  urgent: false,
  tracking_token: "tok",
  pickup_address: "A, Beykoz/İstanbul",
  dropoff_address: "B, Beşiktaş/İstanbul",
  dropoff_contact_name: null,
  dropoff_contact_phone: null,
  pod_receiver_name: null,
  cancel_reason: null,
  problem_note: null,
  customer: { full_name: "Ayşe", phone: "+905321112233", push_token: null },
  courier: null,
};

Deno.test("dispatch: gizli anahtar olmadan 401", async () => {
  const { ctx } = fakeCtx();
  const res = await handler((r) => handleNotifyDispatch(r, ctx, { env: envOf({ NOTIFY_SECRET: "s" }) }))(
    new Request("http://x", { method: "POST" }),
  );
  assertEquals(res.status, 401);
});

Deno.test("dispatch: kuyruktaki bildirimi işler ve durumunu yazar", async () => {
  const { ctx, updated } = fakeCtx({
    tables: {
      "rpc:claim_notifications": [
        { id: 1, order_id: "o1", event: "beklemede", attempts: 1 },
        { id: 2, order_id: "o1", event: "onaylandi", attempts: 1 },
      ],
      orders: [orderRow],
      notifications: [{ id: 1 }, { id: 2 }],
    },
  });
  const { fetchFn } = recorder({ netgsm: { code: "00", jobid: "9" } });
  const res = await handler((r) =>
    handleNotifyDispatch(r, ctx, { env: envOf({ NOTIFY_SECRET: "s", ADMIN_ALERT_PHONES: "+905550000001", ...sms }), fetchFn })
  )(new Request("http://x", { method: "POST", headers: { "x-notify-secret": "s" } }));
  const data = await res.json();
  assertEquals(data.processed, 2);
  assertEquals(data.summary[0].status, "sent");
  assertEquals(data.summary[0].results.length, 2); // müşteri + yönetici
  assertEquals(data.summary[1].status, "skipped"); // onaylandı için mesaj yok
  assertEquals(updated.notifications!.length, 2);
});

Deno.test("dispatch: SMS hatası tekrar denemeye bırakılır, 5. denemede failed", async () => {
  const run = async (attempts: number) => {
    const { ctx } = fakeCtx({
      tables: {
        "rpc:claim_notifications": [{ id: 1, order_id: "o1", event: "teslim_edildi", attempts }],
        orders: [orderRow],
        notifications: [{ id: 1 }],
      },
    });
    const { fetchFn } = recorder({ netgsm: { code: "30" } });
    const res = await handler((r) => handleNotifyDispatch(r, ctx, { env: envOf({ NOTIFY_SECRET: "s", ...sms }), fetchFn }))(
      new Request("http://x", { method: "POST", headers: { "x-notify-secret": "s" } }),
    );
    return (await res.json()).summary[0].status;
  };
  assertEquals(await run(1), "pending");
  assertEquals(await run(5), "failed");
});

Deno.test("dispatch: varış olayı (kind) olay bildirimiyle işlenir", async () => {
  const { ctx } = fakeCtx({
    tables: {
      "rpc:claim_notifications": [{ id: 7, order_id: "o1", event: "yolda", kind: "varis_teslim", attempts: 1 }],
      orders: [{ ...orderRow, status: "yolda", dropoff_contact_name: "Ali Veli", dropoff_contact_phone: "+905334445566" }],
      notifications: [{ id: 7 }],
    },
  });
  const { fetchFn } = recorder({ netgsm: { code: "00", jobid: "9" } });
  const res = await handler((r) => handleNotifyDispatch(r, ctx, { env: envOf({ NOTIFY_SECRET: "s", ...sms }), fetchFn }))(
    new Request("http://x", { method: "POST", headers: { "x-notify-secret": "s" } }),
  );
  const data = await res.json();
  assertEquals(data.summary[0].status, "sent");
  // Alıcıya "kapıda" mesajı; müşterinin push token'ı yok
  assertEquals(data.summary[0].results.map((r: { role: string }) => r.role), ["receiver"]);
});

Deno.test("dispatch: mesaj bildirimi karşı tarafın son mesajıyla push olarak gider", async () => {
  const { ctx } = fakeCtx({
    tables: {
      "rpc:claim_notifications": [{ id: 8, order_id: "o1", event: "yolda", kind: "mesaj_musteri", attempts: 1 }],
      orders: [{ ...orderRow, status: "yolda", customer: { full_name: "Ayşe", phone: "+905321112233", push_token: "ExponentPushToken[c]" }, courier: { profile: { full_name: "Mehmet Kaya", phone: "+905551110001", push_token: "ExponentPushToken[k]" } } }],
      order_messages: [{ order_id: "o1", sender_role: "kurye", body: "Kapıdayım" }],
      notifications: [{ id: 8 }],
    },
  });
  const sent: string[] = [];
  const fetchFn = ((url: string, init?: RequestInit) => {
    sent.push(`${url} ${init?.body ?? ""}`);
    return Promise.resolve(Response.json({ data: [{ status: "ok" }] }));
  }) as unknown as typeof fetch;
  const data = await (await handler((r) => handleNotifyDispatch(r, ctx, { env: envOf({ NOTIFY_SECRET: "s" }), fetchFn }))(
    new Request("http://x", { method: "POST", headers: { "x-notify-secret": "s" } }),
  )).json();
  assertEquals(data.summary[0].status, "sent");
  assertEquals(sent.length, 1);
  assertEquals(sent[0]!.includes("exp.host") && sent[0]!.includes("Kapıdayım") && sent[0]!.includes("ExponentPushToken[c]"), true);
});
