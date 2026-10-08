import type { Metadata } from "next";
import Link from "next/link";
import { DISTRICTS } from "@/lib/districts";

export const metadata: Metadata = {
  title: "Hizmet bölgeleri — İstanbul moto kurye",
  description: "Beykoz merkezli moto kurye: Anadolu yakasının tüm ilçeleri ve Avrupa yakasına köprü geçişli teslimat.",
  alternates: { canonical: "/hizmet-bolgeleri" },
};

export default function BolgelerPage() {
  const groups = [
    { title: "Anadolu yakası", items: DISTRICTS.filter((d) => d.side === "anadolu") },
    { title: "Avrupa yakası (köprü geçişli)", items: DISTRICTS.filter((d) => d.side === "avrupa") },
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-slate-900">Hizmet bölgeleri</h1>
      <p className="mt-2 max-w-2xl text-slate-600">Merkezimiz Beykoz&apos;da. Anadolu yakasına öncelikli, Avrupa yakasına köprü geçiş ücretiyle hizmet veriyoruz.</p>
      {groups.map((g) => (
        <section key={g.title} className="mt-8">
          <h2 className="text-xl font-bold text-slate-900">{g.title}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((d) => (
              <Link key={d.slug} href={`/hizmet-bolgeleri/${d.slug}`} className="rounded-2xl border border-slate-200 p-4 hover:border-brand">
                <div className="font-bold text-slate-900">{d.name} moto kurye</div>
                <div className="mt-1 text-sm text-slate-500">{d.areas.slice(0, 4).join(", ")}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
