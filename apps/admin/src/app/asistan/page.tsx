"use client";

import { useState } from "react";
import { Button, Card, Chip, cx, EmptyState, ErrorText, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { repo, type Conversation } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const CHANNEL: Record<Conversation["channel"], string> = { whatsapp: "WhatsApp", voice: "Telefon", app: "Uygulama", email: "E-posta" };
const CHANNELS = Object.keys(CHANNEL) as Array<Conversation["channel"]>;
const STATUS_RANK: Record<Conversation["status"], number> = { handoff: 0, active: 1, closed: 2 };

function StatusPill({ status }: { status: Conversation["status"] }) {
  if (status === "handoff") return <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">Temsilci bekliyor</span>;
  if (status === "active") return <span className="whitespace-nowrap rounded-full bg-brand-light px-2 py-0.5 text-[11px] font-semibold text-brand">Açık</span>;
  return <span className="whitespace-nowrap rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted">Kapalı</span>;
}

export default function AsistanPage() {
  const { data, error, reload } = useLoad(() => repo.listConversations());
  const [channel, setChannel] = useState<Conversation["channel"] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Handoffs first, then open, then closed; newest first inside each group
  const sorted = [...(data ?? [])].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.lastMessageAt.localeCompare(a.lastMessageAt));
  const list = sorted.filter((c) => !channel || c.channel === channel);
  const selected = list.find((c) => c.id === selectedId) ?? list[0] ?? null;
  const handoffs = sorted.filter((c) => c.status === "handoff").length;

  async function close(id: string) {
    setBusy(true);
    try {
      await repo.closeConversation(id);
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Asistan konuşmaları"
        subtitle={`WhatsApp botu, sesli asistan, uygulama ve e-posta konuşmaları. Temsilci bekleyenler üstte${handoffs ? ` (${handoffs})` : ""}.`}
      />
      <ErrorText>{error}</ErrorText>
      {data && data.length === 0 ? (
        <Card>
          <EmptyState
            sticker="sohbet"
            title="Henüz konuşma yok."
            description="WhatsApp botu ve sesli asistan bağlandığında konuşmalar burada görünür."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="self-start p-3 lg:sticky lg:top-6">
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Kanal">
              <Chip active={!channel} onClick={() => setChannel(null)} count={sorted.length}>
                Tüm kanallar
              </Chip>
              {CHANNELS.map((ch) => {
                const n = sorted.filter((c) => c.channel === ch).length;
                return n ? (
                  <Chip key={ch} active={channel === ch} onClick={() => setChannel(ch)} count={n}>
                    {CHANNEL[ch]}
                  </Chip>
                ) : null;
              })}
            </div>
            {!data ? <p className="px-1 py-4 text-sm text-muted">Yükleniyor…</p> : null}
            {data && list.length === 0 ? <p className="px-1 py-4 text-sm text-muted">Bu kanalda konuşma yok.</p> : null}
            <ul className="-mx-1 max-h-[70vh] space-y-1 overflow-y-auto" aria-label="Konuşmalar">
              {list.map((c) => {
                const last = c.transcript.at(-1)?.text ?? "";
                const isSel = selected?.id === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      aria-current={isSel ? "true" : undefined}
                      data-testid={`conv-${c.id}`}
                      className={cx(
                        "w-full rounded-control px-3 py-2.5 text-left transition",
                        isSel ? "bg-brand-light" : "hover:bg-canvas",
                        c.status === "handoff" && !isSel && "bg-red-50/60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-brand">
                          {CHANNEL[c.channel]} · {c.externalId}
                        </span>
                        <time className="shrink-0 text-[11px] text-muted" dateTime={c.lastMessageAt}>
                          {fmtDateTime(c.lastMessageAt).slice(0, 16)}
                        </time>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <StatusPill status={c.status} />
                        <span className="truncate text-xs text-muted">{c.handoffReason ?? last}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card
            className="min-h-[420px]"
            title={
              selected ? (
                <span className="flex flex-wrap items-center gap-2">
                  {CHANNEL[selected.channel]} · {selected.externalId}
                </span>
              ) : (
                "Yazışma"
              )
            }
            actions={
              selected ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {selected.channel === "whatsapp" ? (
                    <a className="font-semibold text-brand underline underline-offset-2" href={`https://wa.me/${selected.externalId}`} target="_blank" rel="noreferrer">
                      WhatsApp&apos;ta aç
                    </a>
                  ) : selected.channel === "email" ? (
                    <a className="font-semibold text-brand underline underline-offset-2" href={`mailto:${selected.externalId}`}>
                      E-posta yaz
                    </a>
                  ) : null}
                  {selected.status !== "closed" ? (
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => close(selected.id)}>
                      Kapat
                    </Button>
                  ) : null}
                </div>
              ) : null
            }
          >
            {!selected ? (
              <p className="text-sm text-muted">Soldan bir konuşma seçin.</p>
            ) : (
              <div data-testid="conversation">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <StatusPill status={selected.status} />
                  Son mesaj {fmtDateTime(selected.lastMessageAt)}
                </div>
                {selected.handoffReason ? (
                  <p className="mb-3 rounded-control border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Neden: {selected.handoffReason}</p>
                ) : null}
                <ol className="space-y-2">
                  {selected.transcript.map((m, i) => (
                    <li
                      key={i}
                      className={cx(
                        "max-w-xl whitespace-pre-wrap rounded-card px-3 py-2 text-sm",
                        m.role === "user" ? "rounded-bl-sm bg-canvas text-brand" : "ml-auto rounded-br-sm bg-brand-light text-brand",
                      )}
                    >
                      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">{m.role === "user" ? "Müşteri" : "Asistan"}</span>
                      {m.text}
                    </li>
                  ))}
                </ol>
                {selected.transcript.length === 0 ? <p className="text-sm text-muted">Bu konuşmada okunabilir mesaj yok.</p> : null}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
