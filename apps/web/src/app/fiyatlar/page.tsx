import { formatTL } from "@yazgan/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { PriceCalculator } from "@/components/PriceCalculator";
import { Sticker, type StickerName } from "@/components/Sticker";
import { Card, SampleStamp } from "@/components/ui";
import { corporateRows, exampleRoutes, tariffGroups, type TariffGroup } from "@/lib/pricing-info";
import { getPricingSettings } from "@/lib/pricing-settings";

// ISR: re-read the live tariff (pricing_settings) at most once an hour.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Moto kurye fiyatları ve fiyat hesaplama",
  description: "Şeffaf moto kurye tarifesi: açılış ücreti, kademeli km ücreti, acil ve gece ek ücretleri, gidiş-dönüş indirimi. Adresi girin, fiyatı anında görün.",
  alternates: { canonical: "/fiyatlar" },
};

function Rows({ rows }: { rows: TariffGroup["rows"] }) {
  return (
    <dl className="divide-y divide-neo-bg text-sm">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-slate-700">{r.label}</dt>
          <dd className="font-bold whitespace-nowrap text-brand">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs text-neo-muted">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

function SubGroup({ group, sticker, tilt }: { group: TariffGroup; sticker?: StickerName; tilt?: string }) {
  return (
    <div className="rounded-2xl bg-neo-bg/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-black tracking-tight text-brand">{group.title}</h3>
        {sticker ? <Sticker name={sticker} className={`-mt-2 -mr-1 w-12 shrink-0 ${tilt ?? "rotate-6"}`} /> : null}
      </div>
      <Rows rows={group.rows} />
      <Notes notes={group.notes} />
    </div>
  );
}

export default async function FiyatlarPage() {
  const settings = await getPricingSettings();
  const g = tariffGroups(settings);
  const examples = exampleRoutes(settings);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 lg:pt-14">
      <PageHero
        title="Fiyatlar"
        lead={
          <>
            Fiyat, alış ve teslim adresleri arasındaki gerçek sürüş mesafesinden hesaplanır. Tüm kalemler sipariş öncesinde açıkça gösterilir. Tutarlara %{settings.vatPct} KDV
            eklenir.
          </>
        }
      />

      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1fr_440px] lg:gap-10">
        {/* Calculator first on mobile; sticky beside the tariff on desktop */}
        <div className="order-first lg:sticky lg:top-24 lg:order-last">
          <h2 className="mb-3 text-2xl font-black tracking-[-0.03em]">Hesaplayın</h2>
          <PriceCalculator settings={settings} compact />
        </div>

        <div className="grid gap-5" data-testid="tariff">
          <h2 className="text-2xl font-black tracking-[-0.03em]">Tarife (KDV hariç)</h2>

          <Card className="p-5 sm:p-6">
            <h3 className="text-xl font-black tracking-tight text-brand">{g.base.title}</h3>
            <p className="mt-1 text-sm text-neo-muted">Her siparişin çekirdeği: açılış ve kademeli km.</p>
            <div className="mt-3">
              <Rows rows={g.base.rows} />
            </div>
            <Notes notes={g.base.notes} />
          </Card>

          <Card className="p-5 sm:p-6">
            <h3 className="text-xl font-black tracking-tight text-brand">Ek ücretler</h3>
            <p className="mt-1 text-sm text-neo-muted">Yalnızca gerektiğinde eklenir, fiyat özetinde ayrı satır olarak görünür.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <SubGroup group={g.urgent} sticker="kronometre" tilt="-rotate-6" />
              <SubGroup group={g.time} sticker="simsek" tilt="rotate-12" />
              <SubGroup group={g.roundTrip} sticker="donus" />
              <SubGroup group={g.road} sticker="kopru" tilt="-rotate-3" />
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black tracking-tight text-brand">{g.limits.title}</h3>
                <p className="mt-1 text-sm text-neo-muted">Motosikletin taşıyabildiği ve güvenceye aldığımız sınırlar.</p>
              </div>
              <Sticker name="kutu" className="-mt-3 w-16 shrink-0 -rotate-6" />
            </div>
            <div className="mt-3">
              <Rows rows={g.limits.rows} />
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h3 className="text-xl font-black tracking-tight text-brand">Kurumsal indirim</h3>
            <div className="mt-3">
              <Rows rows={corporateRows(settings)} />
            </div>
            <p className="mt-3 text-sm text-neo-muted">
              İndirim ay sonu faturasındaki taşıma bedeline (açılış, km, hizmet ve zaman ekleri) uygulanır; köprü, bekleme, ağır paket ve uzak alış ücretleri indirimsizdir.{" "}
              <Link href="/kurumsal" className="font-semibold text-brand underline">
                Kurumsal hesap başvurusu
              </Link>
            </p>
          </Card>
        </div>
      </div>

      <section className="mt-16 lg:mt-20" aria-labelledby="ornek-rotalar">
        <h2 id="ornek-rotalar" className="text-3xl font-black tracking-[-0.03em]">
          Örnek hesaplar
        </h2>
        <p className="mt-2 max-w-2xl text-neo-muted-dark">
          Aynı fiyat fonksiyonuyla hesaplandı; hafta içi gündüz alış varsayıldı. Mesafeler örnektir, gerçek fiyat adreslerinize göre çıkar. Tutarlar KDV hariçtir.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {examples.map((e) => (
            <Card key={e.title} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black tracking-tight text-brand">{e.title}</h3>
                  <p className="text-sm text-neo-muted">{e.detail}</p>
                </div>
                <SampleStamp className="shrink-0 rotate-3" />
              </div>
              <ul className="mt-4 flex-1 space-y-1.5 border-t-2 border-dashed border-slate-200 pt-3 text-sm">
                {e.quote.lines.map((l) => (
                  <li key={l.code + l.label} className="flex items-baseline justify-between gap-3">
                    <span className="text-slate-700">{l.label}</span>
                    <span className="font-semibold whitespace-nowrap">{formatTL(l.amountKurus)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-baseline justify-between border-t-2 border-dashed border-slate-200 pt-3">
                <span className="text-sm font-bold text-neo-muted">Toplam (KDV hariç)</span>
                <span className="text-xl font-black text-brand">{formatTL(e.quote.subtotalKurus)}</span>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
