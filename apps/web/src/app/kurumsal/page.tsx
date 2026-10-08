import { BRAND, DEFAULT_PRICING_SETTINGS, formatTL } from "@yazgan/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { LeadForm } from "@/components/LeadForm";
import { PageHero } from "@/components/PageHero";
import { Sticker } from "@/components/Sticker";
import { Card, SampleStamp } from "@/components/ui";
import { corporateRows, sampleMonthlyInvoice } from "@/lib/pricing-info";

export const metadata: Metadata = {
  title: "Kurumsal kurye hizmeti — hukuk büroları ve şirketler için",
  description: "Aylık hacme göre indirim, ay sonu tek fatura, ekip hesabı, teslim kanıtı ve API entegrasyonu. Hukuk büroları, muhasebe ofisleri ve şirketler için moto kurye.",
  alternates: { canonical: "/kurumsal" },
};

const BENEFITS = [
  { title: "Ay sonu tek fatura", text: "Her teslimat için ayrı ödeme yok; ay sonunda tüm gönderiler tek e-faturada." },
  { title: "Hacim indirimi", text: corporateRows().map((r) => `${r.label}: ${r.value}`).join(" · ") },
  { title: "Teslim kanıtı", text: "Her teslimatta fotoğraf, teslim alan kişi ve imza. Süreli işlerde ispat elinizde." },
  { title: "Ekip hesabı", text: "Çalışanlarınız kendi telefonlarıyla aynı kurumsal hesaptan sipariş verir." },
  { title: "Gidiş-dönüş imza turu", text: "Belgeyi götürür, imzalatır, geri getiririz; dönüş ayağı yarı fiyatına." },
  { title: "E-posta ve API ile sipariş", text: `Siparişinizi ${BRAND.email.orders} adresine e-postayla iletin veya sisteminizi API ile bağlayın.` },
];

const STEPS = [
  { title: "Başvuru", text: "Formu doldurun: firma, yetkili kişi, telefon ve tahmini aylık gönderi." },
  { title: "Sizi arıyoruz", text: "İhtiyacınızı ve gönderi düzeninizi konuşup hesabınızı açıyoruz." },
  { title: "Ekip davet + ay sonu tek fatura", text: "Çalışanlarınız aynı hesaptan sipariş verir; ay sonunda tek fatura kesilir." },
];

/** Sample month-end invoice (stamped "Örnek"); every amount comes from calculateMonthlyInvoice. */
function InvoiceMock() {
  const inv = sampleMonthlyInvoice();
  const S = DEFAULT_PRICING_SETTINGS;
  const rows: Array<[string, number, string?]> = [
    [`Taşıma bedeli (${inv.deliveryCount} teslimat)`, inv.discountableKurus],
    [`Köprü geçişleri (${inv.bridgeJobs} ×, indirimsiz)`, inv.undiscountedKurus],
    [`Kurumsal indirim (%${inv.discountPct})`, -inv.discountKurus, "text-emerald-700"],
    ["Ara toplam (KDV hariç)", inv.subtotalKurus],
    [`KDV (%${S.vatPct})`, inv.vatKurus],
  ];
  return (
    <div className="relative">
      <Sticker name="fis" className="absolute -top-8 -right-2 z-10 w-16 rotate-6 sm:-right-4 sm:w-20" />
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-3 pr-14">
          <span className="text-xs font-extrabold tracking-[0.14em] text-neo-muted uppercase">Ay sonu faturası</span>
          <SampleStamp className="-rotate-3" />
        </div>
        <ul className="mt-4 space-y-2 border-t-2 border-dashed border-slate-200 pt-3 text-sm">
          {rows.map(([label, amount, cls]) => (
            <li key={label} className="flex items-baseline justify-between gap-3">
              <span className="text-slate-700">{label}</span>
              <span className={`font-semibold whitespace-nowrap ${cls ?? "text-brand"}`}>{formatTL(amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between border-t-2 border-dashed border-slate-200 pt-3">
          <span className="font-black text-brand">Toplam</span>
          <span className="text-2xl font-black text-brand">{formatTL(inv.totalKurus)}</span>
        </div>
        <p className="mt-3 text-xs text-neo-muted">
          Örnek ay: {inv.deliveryCount - inv.bridgeJobs} × 8 km aynı yaka + {inv.bridgeJobs} × 12 km Avrupa geçişli, standart, hafta içi gündüz. İndirim yalnız taşıma bedeline uygulanır; köprü, bekleme, ağır
          paket ve uzak alış indirimsizdir.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {corporateRows().map((r) => (
            <span key={r.label} className="rounded-full bg-neo-bg px-3 py-1.5 text-xs font-bold text-brand">
              {r.label}: {r.value}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function KurumsalPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 lg:pt-14">
      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
        <div>
          <PageHero
            title="Kurumsal moto kurye"
            sticker="bina"
            lead="Hukuk büroları, muhasebe ofisleri, ajanslar ve şirketler için düzenli ve acil evrak/paket teslimatı. Başvurunuzu bırakın, en kısa sürede sizi arayalım."
          >
            <a
              href="#basvuru"
              className="mt-6 flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent px-7 text-lg font-extrabold text-brand hover:bg-accent-dark lg:hidden"
            >
              Başvuru formuna in <span aria-hidden="true">↓</span>
            </a>
          </PageHero>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <Card key={b.title} className="p-5">
                <h2 className="font-black tracking-tight text-brand">{b.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{b.text}</p>
              </Card>
            ))}
          </div>

          <section className="mt-12" aria-labelledby="surec">
            <h2 id="surec" className="text-2xl font-black tracking-[-0.03em]">
              Nasıl başlarız?
            </h2>
            <ol className="mt-4 grid gap-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex items-start gap-4 rounded-3xl bg-white/70 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent font-black text-brand">{i + 1}</span>
                  <span>
                    <span className="block font-black text-brand">{s.title}</span>
                    <span className="block text-sm text-slate-600">{s.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-12" aria-labelledby="fatura">
            <h2 id="fatura" className="mb-5 text-2xl font-black tracking-[-0.03em]">
              Ay sonunda tek fatura
            </h2>
            <InvoiceMock />
          </section>

          <p className="mt-8 text-sm text-slate-600">
            Yazılım ekibiniz mi var?{" "}
            <Link href="/api-belgeleri" className="font-semibold text-brand underline">
              API belgelerine göz atın
            </Link>
            .
          </p>
        </div>

        <div id="basvuru" className="scroll-mt-24 lg:sticky lg:top-24">
          <h2 className="mb-3 text-2xl font-black tracking-[-0.03em]">Kurumsal hesap başvurusu</h2>
          <LeadForm kind="kurumsal" sourcePage="/kurumsal" />
        </div>
      </div>
    </div>
  );
}
