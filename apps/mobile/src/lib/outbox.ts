/**
 * Çevrimdışı kuyruğun uygulama bağlantısı: AsyncStorage'da kalıcı, kurye işlemlerini api ile gönderir,
 * uygulama öne gelince ve 15 saniyede bir yeniden dener. Kurallar: outbox-core.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { api } from "./api";
import { formatTime } from "./format";
import { createOutbox, type OutboxItem, type OutboxTask } from "./outbox-core";

const KEY = "yazgan.outbox.v1";

export const outbox = createOutbox({
  async load() {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
    } catch {
      return [];
    }
  },
  async save(items) {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  },
  async exec(task: OutboxTask, at: string) {
    switch (task.kind) {
      case "action":
        return api.courierAction(task.orderId, task.action, { occurredAt: at, fileStamp: task.fileStamp });
      case "reprice":
        return api.repriceOrder(task.orderId);
      case "arrive":
        await api.markArrived(task.orderId, task.stop, task.loc, at);
        return;
      case "failed":
        return api.reportFailedDelivery(task.orderId, task.input, { occurredAt: at, fileStamp: task.fileStamp });
      case "location":
        return api.pushLocation({ ...task.loc, recordedAt: at }, task.orderId);
      case "sos": {
        // Geç giden alarmda basıldığı saat nota eklenir
        const late = Date.now() - new Date(at).getTime() > 60_000;
        const note = [task.note, late ? `(çevrimdışıyken ${formatTime(at)}'de bildirildi)` : null].filter(Boolean).join(" ");
        await api.raiseSos({ kind: task.incident, note: note || undefined, at: task.loc });
        return;
      }
    }
  },
  now: () => new Date(),
  id: () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
});

let started = false;
/** Kurye ekranları açıkken arka planda yeniden dener (bir kez başlatılır) */
export function startOutboxSync() {
  if (started) return;
  started = true;
  const tryFlush = () => outbox.flush().catch(() => undefined);
  setInterval(tryFlush, 15_000);
  AppState.addEventListener("change", (s) => {
    if (s === "active") tryFlush();
  });
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("online", tryFlush);
  tryFlush();
}

/** Bekleyen ve gönderilemeyen işlemler (ekranda göstermek için) */
export function useOutbox() {
  const [items, setItems] = useState<OutboxItem[]>([]);
  useEffect(() => {
    let alive = true;
    const read = () => outbox.items().then((x) => alive && setItems(x));
    read();
    const off = outbox.subscribe(read);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return {
    pending: items.filter((i) => !i.error && i.task.kind !== "location"),
    locations: items.filter((i) => i.task.kind === "location").length,
    failed: items.filter((i) => i.error),
  };
}
