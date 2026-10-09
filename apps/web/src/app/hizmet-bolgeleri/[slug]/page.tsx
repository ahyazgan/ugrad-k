import { BRAND } from "@yazgan/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/PageHero";
import { PriceCalculator } from "@/components/PriceCalculator";
import { Card, SampleStamp } from "@/components/ui";
import { DISTRICTS, districtBySlug } from "@/lib/districts";
import { bridgeRuleText, districtEstimate, tl } from "@/lib/pricing-info";
import { getPricingSettings } from "@/lib/pricing-settings";
import { absoluteUrl, APP_URL } from "@/lib/site";
import { suffix } from "@/lib/tr";

export const dynamicParams = false;
// ISR: re-read the live tariff (pricing_settings) at most once an hour.
export const revalidate = 3600;
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
  const settings = await getPricingSettings();
  const neighbors = DISTRICTS.filter((x) => x.side === d.side && x.slug !== d.slug).slice(0, 6);
  const estimate = districtEstimate(settings, d);
  const isHome = d.slug === "beykoz";
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 lg:pt-14">
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
      <nav className="text-sm font-semibold text-neo-muted" aria-label="Konum">
        <Link href="/hizmet-bolgeleri" className="underline hover:text-brand">
          Hizmet bölgeleri
        </Link>{" "}
        / {d.name}
      </nav>
      <div className="mt-5 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-12">
        <div>
          <PageHero title={`${d.name} moto kurye`} sticker="pin" tilt="left" lead={d.intro} />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <h2 className="font-black tracking-tight text-brand">{suffix(d.name, "locative")} sık taşıdıklarımız</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {d.typical.map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neo-dot" />
                    {t}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <h2 className="font-black tracking-tight text-brand">Hizmet verdiğimiz semtler</h2>
              <p className="mt-3 text-sm text-slate-700">
                {d.areas.join(", ")} ve {suffix(d.name, "genitive")} tüm mahalleleri.
              </p>
            </Card>
          </div>
          <Card className="mt-4 p-5" data-testid="district-estimate">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-black tracking-tight text-brand">
                  {isHome ? "Beykoz içi standart gönderi" : `Beykoz → ${d.name} standart gönderi`}
                </h2>
                <p className="mt-1 text-sm text-slate-700">
                  {isHome ? "Merkezimize yakın bir adrese" : `Merkezimizden ${suffix(d.name, "genitive")} merkezine`} yaklaşık {estimate.km} km
                  {estimate.bridgeCrossings ? " · köprü geçişi dahil" : ""}
                </p>
              </div>
              <SampleStamp className="shrink-0 rotate-3" label="Tahmini" />
            </div>
            <p className="mt-4 text-3xl font-black tracking-[-0.03em] text-brand">
              ~{tl(estimate.quote.subtotalKurus)} <span className="text-base font-bold text-slate-600">+ KDV</span>
            </p>
            <p className="mt-2 text-xs text-slate-600">
              Mesafe ilçe merkezleri arasından yaklaşık hesaplandı, hafta içi gündüz alış varsayıldı. Gerçek fiyat, adreslerinizin sürüş
              mesafesiyle hesaplanır ve sipariş öncesi kalem kalem gösterilir.
            </p>
          </Card>
          {d.side === "avrupa" ? (
            <p className="mt-4 rounded-3xl bg-brand p-5 text-sm font-semibold text-white">
              {bridgeRuleText(settings)} Bu, Anadolu yakasından {suffix(d.name, "dative")} geçişlerde de Avrupa yakası içindeki işlerde de geçerlidir; ücret fiyat
              özetinde ayrı satırda görünür.
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={APP_URL} className="flex min-h-14 items-center rounded-full bg-accent px-7 font-extrabold text-brand hover:bg-accent-dark">
              Sipariş ver
            </a>
            <Link href="/kurumsal" className="flex min-h-14 items-center rounded-full bg-white px-7 font-extrabold text-brand hover:bg-brand hover:text-white">
              Kurumsal hesap
            </Link>
          </div>
          <h2 className="mt-10 text-xl font-black tracking-[-0.02em]">Yakın bölgeler</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {neighbors.map((n) => (
              <Link key={n.slug} href={`/hizmet-bolgeleri/${n.slug}`} className="rounded-full bg-white px-4 py-2 text-sm font-bold hover:bg-brand hover:text-white">
                {n.name} kurye
              </Link>
            ))}
          </div>
        </div>
        <div className="lg:sticky lg:top-24">
          <h2 className="mb-3 text-2xl font-black tracking-[-0.03em]">{d.name} için fiyat hesapla</h2>
          <PriceCalculator settings={settings} compact />
          <p className="mt-3 text-xs text-slate-500">{BRAND.name} fiyatları KDV hariç tarifeye göre hesaplanır; toplamda KDV dahil gösterilir.</p>
        </div>
      </div>
    </div>
  );
}
