import { BRAND } from "@yazgan/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { FaqAccordion } from "@/components/FaqAccordion";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/PageHero";
import { Sticker } from "@/components/Sticker";
import { Card } from "@/components/ui";
import { FAQ, FAQ_CATEGORIES } from "@/lib/faq";
import { displayPhone, phoneLink, whatsappLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sık sorulan sorular",
  description: "Moto kurye fiyatları, teslim süresi, takip, ödeme, fatura ve kurumsal indirim hakkında sık sorulan sorular.",
  alternates: { canonical: "/sss" },
};

const CHIP = "flex min-h-11 shrink-0 items-center rounded-full bg-white px-4 text-sm font-bold whitespace-nowrap text-brand hover:bg-brand hover:text-white";

function HelpCard() {
  const wa = whatsappLink("Merhaba, bir sorum var.");
  return (
    <Card className="relative p-5">
      <Sticker name="telefon" className="absolute -top-8 right-3 w-16 rotate-6" />
      <h2 className="pr-14 text-lg leading-snug font-black tracking-tight text-brand">Cevabı bulamadınız mı?</h2>
      <p className="mt-2 text-sm text-neo-muted-dark">Bize yazın; en kısa sürede dönelim.</p>
      <div className="mt-4 grid gap-2">
        <Link href="/iletisim" className="flex min-h-12 items-center justify-center rounded-full bg-brand px-5 font-extrabold text-white hover:bg-black">
          İletişim
        </Link>
        {phoneLink ? (
          <a href={phoneLink} className="flex min-h-12 items-center justify-center rounded-full bg-neo-bg px-5 font-extrabold text-brand hover:bg-accent">
            {displayPhone(BRAND.phone)}
          </a>
        ) : null}
        {wa ? (
          <a href={wa} className="flex min-h-12 items-center justify-center rounded-full bg-neo-bg px-5 font-extrabold text-brand hover:bg-accent">
            WhatsApp
          </a>
        ) : null}
        <a href={`mailto:${BRAND.email.info}`} className="text-center text-sm font-semibold break-all text-brand underline">
          {BRAND.email.info}
        </a>
      </div>
    </Card>
  );
}

export default function SssPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 lg:pt-14">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
      <PageHero title="Sık sorulan sorular" lead="Fiyat, teslimat, ödeme ve kurumsal hesap hakkında kısa cevaplar." />

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:mt-10 lg:grid-cols-[200px_minmax(0,1fr)_260px] lg:gap-10">
        {/* Categories: horizontal scroll on phones, sticky vertical list on desktop */}
        <nav aria-label="Soru kategorileri" className="-mx-4 min-w-0 lg:mx-0">
          <ul className="flex gap-2 overflow-x-auto px-4 pb-1 lg:sticky lg:top-24 lg:flex-col lg:overflow-visible lg:px-0">
            {FAQ_CATEGORIES.map((c) => (
              <li key={c.id} className="shrink-0">
                <a href={`#${c.id}`} className={CHIP}>
                  {c.label}
                  <span className="ml-2 text-xs text-neo-inactive">{FAQ.filter((f) => f.category === c.id).length}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid gap-10">
          {FAQ_CATEGORIES.map((c) => (
            <section key={c.id} id={c.id} className="scroll-mt-24" aria-labelledby={`${c.id}-baslik`}>
              <h2 id={`${c.id}-baslik`} className="text-2xl font-black tracking-[-0.03em]">
                {c.label}
              </h2>
              <FaqAccordion className="mt-3" items={FAQ.filter((f) => f.category === c.id)} />
            </section>
          ))}
        </div>

        <aside className="pt-6 lg:pt-10">
          <div className="lg:sticky lg:top-28">
            <HelpCard />
          </div>
        </aside>
      </div>
    </div>
  );
}
