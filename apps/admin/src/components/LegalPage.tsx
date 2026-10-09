import { BRAND } from "@yazgan/shared";
import type { ReactNode } from "react";

/** Herkese açık yasal sayfa düzeni (mağaza listelemelerinde bağlantı verilir). */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-brand px-4 py-5 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="text-lg font-extrabold">{BRAND.name}</div>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl whitespace-pre-line px-4 py-6 leading-relaxed text-slate-800">{children}</main>
    </div>
  );
}
