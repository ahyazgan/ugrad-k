import { describe, expect, it } from "vitest";
import { createOutbox, isNetworkError, MAX_LOCATIONS, taskLabel, type OutboxItem, type OutboxTask } from "../src/lib/outbox-core";

function setup() {
  let online = true;
  let clock = new Date("2026-10-12T10:00:00Z").getTime();
  const executed: Array<{ task: OutboxTask; at: string }> = [];
  const reject = new Map<string, string>();
  let stored: OutboxItem[] = [];
  let n = 0;
  const outbox = createOutbox({
    load: async () => stored,
    save: async (items) => {
      stored = items.map((i) => ({ ...i }));
    },
    exec: async (task, at) => {
      if (!online) throw new TypeError("Network request failed");
      const key = task.kind === "action" ? `${task.orderNo}:${task.action.type}` : `${"orderNo" in task ? task.orderNo : ""}:${task.kind}`;
      const err = reject.get(key);
      if (err) throw new Error(err);
      executed.push({ task, at });
    },
    now: () => new Date(clock),
    id: () => `i${++n}`,
  });
  return {
    outbox,
    executed,
    reject,
    setOnline: (v: boolean) => (online = v),
    tick: (ms: number) => (clock += ms),
    stored: () => stored,
  };
}

const pickup = (orderId = "o1"): OutboxTask => ({ kind: "action", orderId, orderNo: `YK-${orderId}`, action: { type: "pickup", waitingMinutes: 0 }, fileStamp: 1 });
const onTheWay = (orderId = "o1"): OutboxTask => ({ kind: "action", orderId, orderNo: `YK-${orderId}`, action: { type: "on_the_way" }, fileStamp: 1 });
const reprice = (orderId = "o1"): OutboxTask => ({ kind: "reprice", orderId, orderNo: `YK-${orderId}` });

describe("çevrimdışı kuyruk", () => {
  it("bağlantı varken hemen gönderir, kuyruk boş kalır", async () => {
    const t = setup();
    expect(await t.outbox.run([pickup(), reprice()])).toBe("sent");
    expect(t.executed.map((e) => e.task.kind)).toEqual(["action", "reprice"]);
    expect(await t.outbox.items()).toEqual([]);
  });

  it("ağ yoksa kuyruğa alır; bağlantı gelince işlem anının zamanıyla ve sırayla gönderir", async () => {
    const t = setup();
    t.setOnline(false);
    expect(await t.outbox.run([pickup(), reprice()])).toBe("queued");
    t.tick(5 * 60_000);
    expect(await t.outbox.run([onTheWay()])).toBe("queued");
    expect(t.stored()).toHaveLength(3); // kalıcı saklandı
    t.tick(10 * 60_000);
    t.setOnline(true);
    expect(await t.outbox.flush()).toEqual({ sent: 3, remaining: 0 });
    expect(t.executed.map((e) => `${e.task.kind}@${e.at.slice(11, 16)}`)).toEqual(["action@10:00", "reprice@10:00", "action@10:05"]);
  });

  it("bağlantı geldi ama siparişin bekleyen işi var: yeni işlem sırayı bozmaz", async () => {
    const t = setup();
    t.setOnline(false);
    await t.outbox.run([pickup()]);
    t.setOnline(true);
    // Başka sipariş beklemez; aynı sipariş bekler
    expect(await t.outbox.run([pickup("o2")])).toBe("sent");
    expect(await t.outbox.run([onTheWay()])).toBe("queued");
    await t.outbox.flush();
    expect(t.executed.map((e) => taskLabel(e.task))).toEqual(["YK-o2 · Paketi aldım", "YK-o1 · Paketi aldım", "YK-o1 · Yola çıktım"]);
  });

  it("sunucu kuralı reddederse hemen hata; kuyruktakiyse gönderilemedi olarak kalır ve o siparişi durdurur", async () => {
    const t = setup();
    t.reject.set("YK-o1:pickup", "Önce işi kabul edin");
    await expect(t.outbox.run([pickup()])).rejects.toThrow("Önce işi kabul edin");
    expect(await t.outbox.items()).toEqual([]);

    t.setOnline(false);
    await t.outbox.run([pickup(), reprice()]);
    await t.outbox.run([pickup("o2")]);
    t.setOnline(true);
    expect(await t.outbox.flush()).toEqual({ sent: 1, remaining: 1 });
    const items = await t.outbox.items();
    expect(items.map((i) => [taskLabel(i.task), i.error])).toEqual([
      ["YK-o1 · Paketi aldım", "Önce işi kabul edin"],
      ["YK-o1 · Ücret güncelleme", null],
    ]);
    // Kullanıcı reddedileni silince sıradaki gider
    await t.outbox.discard(items[0]!.id);
    t.reject.clear();
    expect(await t.outbox.flush()).toEqual({ sent: 1, remaining: 0 });
  });

  it("konum: dakikada en fazla bir nokta, sınır aşılınca en eskisi atılır, reddedilen konum atılır", async () => {
    const t = setup();
    t.setOnline(false);
    const loc = (lat: number): OutboxTask => ({ kind: "location", orderId: null, loc: { lat, lng: 29 } });
    await t.outbox.run([loc(41.0)]);
    t.tick(20_000);
    await t.outbox.run([loc(41.1)]); // aynı dakika: güncellenir
    expect((await t.outbox.items()).map((i) => (i.task as { loc: { lat: number } }).loc.lat)).toEqual([41.1]);
    for (let i = 0; i < MAX_LOCATIONS + 5; i++) {
      t.tick(61_000);
      await t.outbox.run([loc(42 + i / 1000)]);
    }
    expect((await t.outbox.items()).filter((i) => i.task.kind === "location")).toHaveLength(MAX_LOCATIONS);
    t.setOnline(true);
    t.reject.set(":location", "Konum çok eski");
    expect(await t.outbox.flush()).toEqual({ sent: 0, remaining: 0 });
  });

  it("ağ hatası tanıma", () => {
    expect(isNetworkError(new TypeError("x"))).toBe(true);
    expect(isNetworkError(new Error("TypeError: Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("Failed to send a request to the Edge Function"))).toBe(true);
    expect(isNetworkError(new Error("Önce işi kabul edin"))).toBe(false);
  });
});
