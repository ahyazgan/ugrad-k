"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, ErrorText, Input } from "@/components/ui";
import { fmtTime } from "@/lib/dates";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const WHO = { musteri: "Müşteri", kurye: "Kurye", admin: "Siz (destek)" } as const;

/** Sipariş yazışması: müşteri ↔ kurye; yönetici okur ve destek olarak yazabilir (canlı) */
export function OrderMessages({ orderId }: { orderId: string }) {
  const { data, error, reload } = useLoad(() => repo.listOrderMessages(orderId), [orderId]);
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  useEffect(() => repo.subscribeOrderMessages(orderId, reload), [orderId, reload]);

  async function send(e: FormEvent) {
    e.preventDefault();
    setSendError(null);
    try {
      await repo.sendOrderMessage(orderId, text);
      setText("");
      reload();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Gönderilemedi");
    }
  }

  return (
    <Card title={`Mesajlar${data?.length ? ` (${data.length})` : ""}`}>
      <ErrorText>{error}</ErrorText>
      <ol className="max-h-80 space-y-2 overflow-y-auto text-sm" data-testid="order-messages">
        {(data ?? []).map((m) => (
          <li key={m.id} className={m.senderRole === "admin" ? "text-right" : ""}>
            <span
              className={`inline-block max-w-[85%] rounded-xl px-3 py-1.5 ${
                m.senderRole === "admin" ? "bg-brand text-white" : m.senderRole === "kurye" ? "bg-slate-100" : "bg-amber-50"
              }`}
            >
              <span className="block text-[11px] opacity-70">
                {WHO[m.senderRole]} · {fmtTime(m.createdAt)}
                {m.readAt && m.senderRole !== "admin" ? " · okundu" : ""}
              </span>
              {m.body}
            </span>
          </li>
        ))}
        {data && !data.length ? <li className="text-slate-500">Henüz yazışma yok.</li> : null}
      </ol>
      <form onSubmit={send} className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <Input placeholder="Müşteriye ve kuryeye yaz (destek)" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} data-testid="admin-chat-input" />
        </div>
        <Button type="submit" disabled={!text.trim()}>
          Gönder
        </Button>
      </form>
      <ErrorText>{sendError}</ErrorText>
    </Card>
  );
}
