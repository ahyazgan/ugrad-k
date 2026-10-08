import { GIZLILIK_POLITIKASI } from "@yazgan/shared";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gizlilik Politikası", alternates: { canonical: "/gizlilik" } };

export default function GizlilikPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-slate-900">Gizlilik Politikası</h1>
      <div className="mt-6 whitespace-pre-line leading-relaxed text-slate-700">{GIZLILIK_POLITIKASI}</div>
    </article>
  );
}
