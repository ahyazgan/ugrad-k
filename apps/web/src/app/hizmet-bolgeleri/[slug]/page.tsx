import { BRAND } from "@yazgan/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { PriceCalculator } from "@/components/PriceCalculator";
import { DISTRICTS, districtBySlug } from "@/lib/districts";
import { absoluteUrl, APP_URL } from "@/lib/site";
import { suffix } from "@/lib/tr";

export const dynamicParams = false;
export function generateStaticParams() {
  return DISTRICTS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = districtBySlug((await params).slug);
  if (!d) return {};
  return {
    title: `${d.name} moto kurye — acil evrak ve paket`,
    description: `${d.name} (${d.areas.slice(0, 3).join(", ")}) için moto kurye: anında fiyat, canlı takip, teslim kanıtı. ${d.side === "avrupa" ? "Anadolu yakasından köprü geçişli teslimat." : "Anadolu yakası öncelikli hizmet."}`,
    alternates: { canonical: `/hizmet-bolgeleri/${d.slug}` },
  };
}

export default async function DistrictPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = districtBySlug((await params).slug);
  if (!d) notFound();
  const neighbors = DISTRICTS.filter((x) => x.side === d.side && x.slug !== d.slug).slice(0, 6);
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          serviceType: "Moto kurye",
          name: `${d.name} moto kurye`,
          provider: { "@id": absoluteUrl("/#isletme") },
          areaServed: { "@type": "City", name: `${d.name}, İstanbul` },
          url: absoluteUrl(`/hizmet-bolgeleri/${d.slug}`),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Ana sayfa", item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: "Hizmet bölgeleri", item: absoluteUrl("/hizmet-bolgeleri") },
            { "@type": "ListItem", position: 3, name: d.name, item: absoluteUrl(`/hizmet-bolgeleri/${d.slug}`) },
          ],
        }}
      />
      <nav className="text-sm text-slate-500" aria-label="Konum">
        <Link href="/hizmet-bolgeleri" className="hover:text-brand">
          Hizmet bölgeleri
        </Link>{" "}
        / {d.name}
      </nav>
      <div className="mt-4 grid gap-10 lg:grid-cols-[1fr_440px]">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">{d.name} moto kurye</h1>
          <p className="mt-4 text-lg text-slate-600">{d.intro}</p>
          <h2 className="mt-8 text-lg font-bold text-slate-900">{suffix(d.name, "locative")} sık taşıdıklarımız</h2>
          <ul className="mt-2 space-y-1 text-slate-700">
            {d.typical.map((t) => (
              <li key={t}>• {t}</li>
            ))}
          </ul>
          <h2 className="mt-8 text-lg font-bold text-slate-900">Hizmet verdiğimiz semtler</h2>
          <p className="mt-2 text-slate-700">{d.areas.join(", ")} ve {suffix(d.name, "genitive")} tüm mahalleleri.</p>
          {d.side === "avrupa" ? (
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              Anadolu yakasından {suffix(d.name, "dative")} geçişlerde köprü geçiş ücreti fiyat özetinde ayrı kalem olarak gösterilir.
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={APP_URL} className="rounded-xl bg-brand px-6 py-3 font-bold text-white hover:bg-brand-dark">
              Sipariş ver
            </a>
            <Link href="/kurumsal" className="rounded-xl border border-brand px-6 py-3 font-bold text-brand">
              Kurumsal hesap
            </Link>
          </div>
          <h2 className="mt-10 text-lg font-bold text-slate-900">Yakın bölgeler</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {neighbors.map((n) => (
              <Link key={n.slug} href={`/hizmet-bolgeleri/${n.slug}`} className="rounded-full border border-slate-200 px-4 py-1.5 text-sm hover:border-brand">
                {n.name} kurye
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-xl font-bold text-slate-900">{d.name} için fiyat hesapla</h2>
          <PriceCalculator compact />
          <p className="mt-3 text-xs text-slate-500">{BRAND.name} fiyatları KDV hariç tarifeye göre hesaplanır; toplamda KDV dahil gösterilir.</p>
        </div>
      </div>
    </div>
  );
}
