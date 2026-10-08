"use client";

import { useState } from "react";
import { Button, Card, ErrorText, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { repo, type Conversation } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const CHANNEL: Record<Conversation["channel"], string> = { whatsapp: "WhatsApp", voice: "Telefon", app: "Uygulama", email: "E-posta" };

export default function AsistanPage() {
  const { data, error, reload } = useLoad(() => repo.listConversations());
  const [openId, setOpenId] = useState<string | null>(null);
  const sorted = [...(data ?? [])].sort((a, b) => Number(b.status === "handoff") - Number(a.status === "handoff"));

  return (
    <>
      <PageHeader
        title="Asistan konuşmaları"
        subtitle="WhatsApp botu ve sesli asistan konuşmaları. Temsilci bekleyenler üstte."
      />
      <ErrorText>{error}</ErrorText>
      <div className="space-y-3">
        {sorted.map((c) => (
          <Card
            key={c.id}
            title={
              <span>
                {CHANNEL[c.channel]} · {c.externalId}
                {c.status === "handoff" ? (
                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Temsilci bekliyor</span>
                ) : c.status === "closed" ? (
                  <span className="ml-2 text-xs text-slate-500">Kapalı</span>
                ) : null}
              </span>
            }
            actions={
              <div className="flex items-center gap-2 text-sm text-slate-500">
                {fmtDateTime(c.lastMessageAt)}
                {c.channel === "whatsapp" ? (
                  <a className="text-brand underline" href={`https://wa.me/${c.externalId}`} target="_blank" rel="noreferrer">
                    WhatsApp&apos;ta aç
                  </a>
                ) : c.channel === "email" ? (
                  <a className="text-brand underline" href={`mailto:${c.externalId}`}>
                    E-posta yaz
                  </a>
                ) : null}
                <Button variant="ghost" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                  {openId === c.id ? "Gizle" : "Yazışma"}
                </Button>
                {c.status !== "closed" ? (
                  <Button variant="secondary" onClick={() => repo.closeConversation(c.id).then(reload)}>
                    Kapat
                  </Button>
                ) : null}
              </div>
            }
          >
            {c.handoffReason ? <p className="text-sm text-red-800">Neden: {c.handoffReason}</p> : null}
            {openId === c.id ? (
              <ol className="mt-3 space-y-2">
                {c.transcript.map((m, i) => (
                  <li
                    key={i}
                    className={`max-w-xl whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                      m.role === "user" ? "bg-slate-100" : "ml-auto bg-brand-light text-brand-dark"
                    }`}
                  >
                    {m.text}
                  </li>
                ))}
              </ol>
            ) : null}
          </Card>
        ))}
        {data && !data.length ? <p className="text-slate-500">Henüz konuşma yok.</p> : null}
      </div>
    </>
  );
}
