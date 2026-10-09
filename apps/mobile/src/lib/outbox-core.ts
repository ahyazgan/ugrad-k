/**
 * Çevrimdışı kuyruk (çekirdek, platformdan bağımsız): kurye işlemleri bağlantı yokken telefonda
 * sırayla saklanır, bağlantı gelince yapıldıkları anın zamanıyla gönderilir.
 * Kurallar:
 *  • Yalnız AĞ hatası kuyruğa alır; sunucunun reddettiği işlem (kural hatası) kullanıcıya gösterilir.
 *  • Aynı siparişin işlemleri sırası bozulmadan gider: bekleyen işi olan siparişin yeni işlemi de kuyruğa girer.
 *  • Kuyruktaki işlem sunucuda reddedilirse "gönderilemedi" olarak kalır ve o siparişin sonraki işlemlerini durdurur.
 *  • Konum noktaları en fazla dakikada bir ve en fazla MAX_LOCATIONS kadar saklanır; eskiyen konum atılır.
 */
import type { CourierActionInput, CourierLocation, FailedDeliveryInput } from "./api/types";
import type { IncidentKind } from "@yazgan/shared";

export type OutboxTask =
  | { kind: "action"; orderId: string; orderNo: string; action: CourierActionInput; fileStamp: number }
  | { kind: "reprice"; orderId: string; orderNo: string }
  | { kind: "arrive"; orderId: string; orderNo: string; stop: "alis" | "teslim"; loc: CourierLocation | null }
  | { kind: "failed"; orderId: string; orderNo: string; input: FailedDeliveryInput; fileStamp: number }
  | { kind: "location"; orderId: string | null; loc: CourierLocation }
  | { kind: "sos"; incident: IncidentKind; note: string | null; loc: (CourierLocation & { accuracy?: number | null }) | null };

export interface OutboxItem {
  id: string;
  task: OutboxTask;
  /** İşlemin yapıldığı an (sunucuya bu zamanla gider) */
  at: string;
  attempts: number;
  /** Sunucu reddettiyse neden (artık otomatik denenmez) */
  error: string | null;
}

export interface OutboxDeps {
  load(): Promise<OutboxItem[]>;
  save(items: OutboxItem[]): Promise<void>;
  exec(task: OutboxTask, at: string): Promise<void>;
  now(): Date;
  id(): string;
}

export const MAX_LOCATIONS = 120;
const LOCATION_MIN_GAP_MS = 60_000;

const NETWORK = /network request failed|failed to fetch|networkerror|fetch failed|load failed|failed to send a request|network error|timed? ?out|internet/i;

/** Bağlantı hatası mı (kural hatası değil)? */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return NETWORK.test(msg);
}

/** Sıra anahtarı: aynı siparişin işlemleri birbirini bekler (konum beklemez) */
const orderKey = (t: OutboxTask) => (t.kind === "location" || t.kind === "sos" ? null : t.orderId);

/** Kullanıcıya gösterilecek kısa ad */
export function taskLabel(t: OutboxTask): string {
  switch (t.kind) {
    case "action":
      return `${t.orderNo} · ${{ pickup: "Paketi aldım", on_the_way: "Yola çıktım", deliver: "Teslim", return_deliver: "Göndericiye iade", problem: "Sorun bildirimi", release: "İşi bırak" }[t.action.type]}`;
    case "reprice":
      return `${t.orderNo} · Ücret güncelleme`;
    case "arrive":
      return `${t.orderNo} · ${t.stop === "alis" ? "Alışa vardım" : "Teslime vardım"}`;
    case "failed":
      return `${t.orderNo} · Teslim edilemedi`;
    case "location":
      return "Konum";
    case "sos":
      return "ACİL DURUM";
  }
}

export function createOutbox(deps: OutboxDeps) {
  let items: OutboxItem[] | null = null;
  let flushing: Promise<{ sent: number; remaining: number }> | null = null;
  const listeners = new Set<() => void>();

  const all = async () => (items ??= await deps.load());
  const persist = async () => {
    await deps.save(items ?? []);
    listeners.forEach((l) => l());
  };

  function pushItem(list: OutboxItem[], task: OutboxTask, at: string) {
    if (task.kind === "location") {
      const last = [...list].reverse().find((i) => i.task.kind === "location");
      if (last && new Date(at).getTime() - new Date(last.at).getTime() < LOCATION_MIN_GAP_MS) {
        last.task = task;
        last.at = at;
        return;
      }
      const locs = list.filter((i) => i.task.kind === "location");
      if (locs.length >= MAX_LOCATIONS) list.splice(list.indexOf(locs[0]!), 1);
    }
    list.push({ id: deps.id(), task, at, attempts: 0, error: null });
  }

  /**
   * Görevleri sırayla çalıştırır. Ağ hatasında (veya aynı siparişin bekleyen işi varsa) kalanları
   * kuyruğa alır ve "queued" döner. Sunucu reddederse hata fırlatır (kullanıcı düzeltir).
   */
  async function run(tasks: OutboxTask[]): Promise<"sent" | "queued"> {
    const list = await all();
    const at = deps.now().toISOString();
    let queued = false;
    for (const t of tasks) {
      const key = orderKey(t);
      const blocked = key != null && list.some((i) => orderKey(i.task) === key);
      if (!queued && !blocked) {
        try {
          await deps.exec(t, at);
          continue;
        } catch (e) {
          if (!isNetworkError(e)) throw e;
        }
      }
      queued = true;
      pushItem(list, t, at);
    }
    if (queued) await persist();
    return queued ? "queued" : "sent";
  }

  /** Bekleyenleri sırayla gönderir (aynı anda tek çalışma). Ağ yoksa durur. */
  function flush(): Promise<{ sent: number; remaining: number }> {
    flushing ??= (async () => {
      const list = await all();
      let sent = 0;
      const stopped = new Set<string>();
      try {
        for (const item of [...list]) {
          const key = orderKey(item.task);
          if (item.error || (key && stopped.has(key))) {
            if (key) stopped.add(key);
            continue;
          }
          try {
            await deps.exec(item.task, item.at);
            list.splice(list.indexOf(item), 1);
            sent++;
          } catch (e) {
            if (isNetworkError(e)) break;
            item.attempts++;
            if (item.task.kind === "location") {
              // Eski/geçersiz konum: atılır
              list.splice(list.indexOf(item), 1);
            } else {
              item.error = e instanceof Error ? e.message : "Gönderilemedi";
              if (key) stopped.add(key);
            }
          }
        }
      } finally {
        await persist();
        flushing = null;
      }
      return { sent, remaining: list.filter((i) => !i.error).length };
    })();
    return flushing;
  }

  return {
    run,
    flush,
    async items() {
      return [...(await all())];
    },
    /** Gönderilemeyen (sunucu reddetti) işlemi kuyruktan siler */
    async discard(id: string) {
      const list = await all();
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) list.splice(i, 1);
      await persist();
    },
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
