import type { Metadata } from "next";
import Link from "next/link";
import { CoverageMap } from "@/components/CoverageMap";
import { PageHero } from "@/components/PageHero";
import { Sticker } from "@/components/Sticker";
import { CARD } from "@/components/ui";
import { DISTRICTS } from "@/lib/districts";
import { bridgeRuleText, tl } from "@/lib/pricing-info";
import { getPricingSettings } from "@/lib/pricing-settings";

// ISR: re-read the live tariff (pricing_settings) at most once an hour.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Hizmet bölgeleri — İstanbul moto kurye",
  description: "Beykoz merkezli moto kurye: Anadolu yakasının tüm ilçeleri ve Avrupa yakasına köprü geçişli teslimat.",
  alternates: { canonical: "/hizmet-bolgeleri" },
};

const DISTRICT_CARD = `${CARD} p-5 transition hover:-translate-y-0.5`;

export default async function BolgelerPage() {
  const settings = await getPricingSettings();
  const anadolu = DISTRICTS.filter((d) => d.side === "anadolu");
  const avrupa = DISTRICTS.filter((d) => d.side === "avrupa");
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 lg:pt-14">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <PageHero
          title="Hizmet bölgeleri"
          lead={<>Merkezimiz Beykoz&apos;da. Anadolu yakasına öncelikli, Avrupa yakasına köprü geçiş ücretiyle hizmet veriyoruz.</>}
        >
          <div className="mt-6 flex flex-wrap gap-2 text-sm font-bold">
            <span className="rounded-full bg-white px-4 py-2">{anadolu.length} Anadolu yakası ilçesi</span>
            <span className="rounded-full bg-white px-4 py-2">{avrupa.length} Avrupa yakası ilçesi</span>
          </div>
        </PageHero>
        <CoverageMap />
      </div>

      <section className="mt-14" aria-labelledby="anadolu">
        <h2 id="anadolu" className="text-2xl font-black tracking-[-0.03em]">
          Anadolu yakası
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {anadolu.map((d) => (
            <Link key={d.slug} href={`/hizmet-bolgeleri/${d.slug}`} className={DISTRICT_CARD}>
              <div className="font-black text-brand">{d.name} moto kurye</div>
              <div className="mt-1 text-sm text-slate-500">{d.areas.slice(0, 4).join(", ")}</div>
            </Link>
          ))}
          {/* Fills the last grid cell (11 districts → 12 cells) */}
          <Link href="/fiyatlar#fiyat-hesapla" className="group flex items-center justify-between gap-3 rounded-3xl bg-accent p-5 transition hover:bg-accent-dark">
            <span>
              <span className="block font-black text-brand">Listede yok mu?</span>
              <span className="mt-1 block text-sm font-semibold text-brand/80">Adresi yazın, fiyat çıksın.</span>
            </span>
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand font-black text-white transition group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="avrupa">
        <h2 id="avrupa" className="text-2xl font-black tracking-[-0.03em]">
          Avrupa yakası <span className="text-neo-muted">(köprü geçişli)</span>
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {avrupa.map((d) => (
            <Link key={d.slug} href={`/hizmet-bolgeleri/${d.slug}`} className={DISTRICT_CARD}>
              <div className="font-black text-brand">{d.name} moto kurye</div>
              <div className="mt-1 text-sm text-slate-500">{d.areas.slice(0, 4).join(", ")}</div>
            </Link>
          ))}
          <div className="flex items-center gap-4 rounded-3xl bg-brand p-5 text-white">
            <Sticker name="donus" className="w-12 shrink-0 -rotate-6" />
            <div>
              <div className="font-black">Köprü geçişi +{tl(settings.bridgeFeeKurus)}</div>
              <p className="mt-1 text-sm text-white/75">{bridgeRuleText(settings)} Fiyat özetinde ayrı satırda görünür.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
