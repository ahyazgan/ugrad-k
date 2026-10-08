import { AYDINLATMA_METNI, KVKK_VERSION } from "@yazgan/shared";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "KVKK Aydınlatma Metni", alternates: { canonical: "/kvkk" } };

export default function KvkkPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-slate-900">KVKK Aydınlatma Metni</h1>
      <p className="mt-1 text-sm text-slate-500">Sürüm: {KVKK_VERSION}</p>
      <div className="mt-6 whitespace-pre-line leading-relaxed text-slate-700">{AYDINLATMA_METNI}</div>
    </article>
  );
}
