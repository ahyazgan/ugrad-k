import type { Conversation } from "./types";

type Block = { type?: string; text?: string };
type Msg = { role: "user" | "assistant"; content: string | Block[] };

/** Claude mesaj geçmişinden okunabilir yazışma çıkarır (araç sonuçları ve düşünme blokları atlanır). */
export function toTranscript(messages: Msg[]): Conversation["transcript"] {
  const out: Conversation["transcript"] = [];
  for (const m of messages) {
    const text =
      typeof m.content === "string"
        ? m.content
        : m.content
            .filter((b) => b.type === "text" && b.text)
            .map((b) => b.text!)
            .join("\n");
    // İlk mesajdaki sistem bağlamı satırını gösterme
    const clean = text.replace(/^\[Müşteri bilgisi[^\]]*\][^\n]*\n*/u, "").trim();
    if (clean) out.push({ role: m.role, text: clean });
  }
  return out;
}
