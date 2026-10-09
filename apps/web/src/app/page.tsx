import { BRAND, type PricingSettings } from "@yazgan/shared";
import Link from "next/link";
import { FaqAccordion } from "@/components/FaqAccordion";
import { PriceCalculator } from "@/components/PriceCalculator";
import { Scene, Sticker, type StickerName } from "@/components/Sticker";
import { Card, HandNote, SampleStamp } from "@/components/ui";
import { DISTRICTS } from "@/lib/districts";
import { faqItems } from "@/lib/faq";
import { corporateRows, corporateTiers, returnLegPhrase } from "@/lib/pricing-info";
import { getPricingSettings } from "@/lib/pricing-settings";
import { APP_URL, whatsappLink } from "@/lib/site";

// ISR: re-read the live tariff (pricing_settings) at most once an hour (= PRICING_REVALIDATE_SECONDS).
export const revalidate = 3600;

const STEPS: { n: string; title: string; text: string; sticker: StickerName }[] = [
  { n: "1", sticker: "ev", title: "Adresleri girin", text: "Alış ve teslim adresini yazın; sürüş mesafesine göre fiyat anında çıkar." },
  { n: "2", sticker: "telefon", title: "Onaylayın", text: "Telefon numaranızla giriş yapın, kartla ya da teslimatta ödeyin." },
  { n: "3", sticker: "pin", title: "Canlı takip edin", text: "Kuryeniz haritada; takip bağlantısını alıcıyla paylaşın." },
  { n: "4", sticker: "imza", title: "Teslim kanıtı", text: "Teslimatta fotoğraf ve imza alınır, faturanız otomatik kesilir." },
];

/** Service grid: one 3D sticker per service, all upright and the same size so the B2B section stays calm. */
function services(s: PricingSettings): { title: string; text: string; sticker: StickerName }[] {
  return [
    { sticker: "evrak", title: "Acil evrak", text: "Sözleşme, vekâletname, ihale dosyası: 60 dakika içinde teslim hedefiyle, başka iş yapılmadan doğrudan." },
    { sticker: "adliye", title: "Adliye ve resmi kurum", text: "Anadolu ve İstanbul adliyelerine, icra dairelerine, noterlere dosya ve dilekçe teslimi." },
    { sticker: "imza-donus", title: "Gidiş-dönüş imza", text: `Belgeyi götürür, imzalatır, geri getiririz. Dönüş ayağı ${returnLegPhrase(s)}.` },
    { sticker: "takvim", title: "Planlı gönderi", text: "Yarın sabah için şimdiden sipariş verin; kurye alış saatinden önce yola çıkar." },
    { sticker: "numune", title: "Numune ve küçük paket", text: "Yedek parça, numune, ilaç dışı sağlık malzemesi ve küçük paketler." },
    { sticker: "canta", title: "Kurumsal hesap", text: "Aylık hacme göre indirim, tek fatura, ekip için ortak hesap ve API entegrasyonu." },
  ];
}

/** Only rules the system actually enforces (pricing.ts, SLA credit, invoice queue). */
function promises(s: PricingSettings): { big: string; title: string; text: string; sticker: StickerName }[] {
  return [
    { sticker: "kronometre", big: "60 dk", title: "Acil teslim taahhüdü", text: "Kaçırırsak acil ek ücreti sonraki siparişinizden otomatik düşülür." },
    { sticker: "kalkan", big: "0 TL", title: "Gizli ücret", text: "Her kalem sipariş öncesinde ayrı satırda görünür; sonradan sürpriz yok." },
    ...(s.maxWeightKg != null
      ? [{ sticker: "kutu" as const, big: `${s.maxWeightKg} kg`, title: "Motosiklet sınırı", text: "Daha ağır gönderiler sipariş aşamasında reddedilir; yolda sürpriz olmaz." }]
      : []),
    { sticker: "fis", big: "e-arşiv", title: "Otomatik fatura", text: "Teslimattan sonra faturanız kendiliğinden kesilir; kurumsala ay sonu tek fatura." },
  ];
}

const SECTION = "mx-auto max-w-6xl px-4 py-16 lg:py-20";

/** Sample proof-of-delivery receipt (clearly stamped "Örnek"; no real customer data). */
function ProofMock() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <Card className="relative p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-extrabold tracking-[0.14em] text-neo-muted uppercase">Teslim fişi</span>
          <SampleStamp className="rotate-6" />
        </div>
        {/* Delivery photo slot: illustrated scene (decorative; the receipt is already stamped "Örnek"), never a stock photo */}
        <div className="mt-4 flex aspect-[4/3] items-center justify-center rounded-2xl bg-neo-bg p-3">
          <Scene name="sahne-teslim" sizes="(min-width: 640px) 376px, calc(100vw - 96px)" className="h-full w-auto max-w-full object-contain" />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs font-semibold text-neo-muted">Teslim alan</dt>
            <dd className="font-bold text-brand">Resepsiyon · Ad Soyad</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-neo-muted">Teslim saati</dt>
            <dd className="font-bold text-brand">14:32</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-neo-muted">Sipariş</dt>
            <dd className="font-bold text-brand">YK-0000</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-neo-muted">Teslim kodu</dt>
            <dd className="font-bold text-brand">doğrulandı</dd>
          </div>
        </dl>
        <div className="mt-4 border-t-2 border-dashed border-slate-200 pt-3">
          <div className="text-xs font-semibold text-neo-muted">İmza</div>
          <svg viewBox="0 0 240 60" className="mt-1 h-12 w-48 text-brand" aria-hidden="true">
            <path
              d="M6 42c14-22 24-30 30-26 7 5-9 30-2 31 8 1 16-30 25-29 8 1 0 24 8 24 9 0 14-20 22-19 6 1 2 14 9 14 10 0 20-16 32-17 9 0 6 12 15 11 12-1 22-12 38-14"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </Card>
      <Sticker name="imza" className="absolute -right-1 -bottom-8 w-20 rotate-6 sm:-right-8 sm:w-24" />
    </div>
  );
}

export default async function Home() {
  const settings = await getPricingSettings();
  const wa = whatsappLink("Merhaba, kurye istiyorum.");
  const firstTier = corporateTiers(settings)[0];
  return (
    <>
      <section>
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-10 lg:grid-cols-2 lg:py-16">
          <div className="relative lg:pt-6">
            <p className="inline-flex items-center gap-2 rounded-full bg-brand px-3.5 py-2 text-xs font-extrabold tracking-[0.12em] text-accent">
              <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
              BEYKOZ · ANADOLU YAKASI ÖNCELİKLİ · TÜM İSTANBUL
            </p>
            <h1 className="relative mt-5 text-[clamp(56px,9vw,112px)] leading-[0.9] font-black tracking-[-0.05em]">
              {/* 3B çıkartmalar: em birimiyle başlık boyutuna göre ölçeklenir, satır sonlarındaki boşluğa oturur */}
              <Sticker name="zarf" priority className="absolute top-[0.02em] left-[2.6em] w-[max(56px,0.72em)] -rotate-12" />
              <Sticker name="simsek" priority className="absolute top-[-0.18em] left-[calc(2.6em+max(56px,0.72em)-14px)] w-[max(36px,0.4em)] rotate-12" />
              <Sticker name="kutu" priority className="absolute top-[0.98em] left-[2.3em] w-[max(56px,0.8em)] rotate-6" />
              Hızlı.
              <br />
              Net.
              <br />
              <span className="bg-[linear-gradient(transparent_68%,var(--color-neo-lime)_68%,var(--color-neo-lime)_92%,transparent_92%)]">Kapında.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg font-semibold text-neo-muted-dark">
              {BRAND.name}: hukuk büroları, muhasebeciler ve şirketler için moto kurye. Acil evrakınız bir saatte yerinde; fiyatı önceden görün, kuryeyi canlı takip edin, teslim kanıtını alın.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={APP_URL} className="flex min-h-14 items-center gap-2 rounded-full bg-accent px-7 text-lg font-extrabold text-brand shadow-[0_8px_20px_rgba(155,194,15,.35)] hover:bg-accent-dark">
                Hemen sipariş ver <span aria-hidden="true">→</span>
              </a>
              <Link href="/kurumsal" className="flex min-h-14 items-center rounded-full bg-white px-7 text-lg font-extrabold text-brand hover:bg-brand hover:text-white">
                Kurumsal hesap aç
              </Link>
              {wa ? (
                <a href={wa} className="flex min-h-14 items-center rounded-full border-2 border-emerald-700 px-7 font-extrabold text-emerald-800 hover:bg-emerald-50">
                  WhatsApp
                </a>
              ) : null}
            </div>
            <ul className="mt-8 grid max-w-lg grid-cols-2 gap-3 text-sm font-semibold text-neo-muted-dark">
              <li>✓ Gizli ücret yok, kalem kalem fiyat</li>
              <li>✓ Canlı konum takibi</li>
              <li>✓ Fotoğraf + imza ile teslim</li>
              <li>✓ Otomatik e-arşiv fatura</li>
            </ul>
          </div>
          <div>
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="text-2xl font-black">Fiyatı hemen hesaplayın</h2>
              <Sticker name="motor" priority className="-mt-4 -mb-2 w-28 shrink-0 -rotate-3 sm:w-40 lg:-mt-10 lg:w-48" />
            </div>
            {/* Hero already carries four stickers on desktop: keep the receipt sticker for smaller screens only */}
            <PriceCalculator settings={settings} receiptStickerClassName="lg:hidden" />
          </div>
        </div>
      </section>

      <section className={SECTION}>
        <h2 className="text-3xl font-black">Nasıl çalışır?</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <Card as="li" key={s.n} className="p-5">
              <div className="relative h-10">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-black text-brand">{s.n}</div>
                <Sticker name={s.sticker} className="absolute -top-3 right-0 w-14 rotate-6" />
              </div>
              <div className="mt-3 text-lg font-black tracking-tight">{s.title}</div>
              <p className="mt-1 text-sm text-slate-600">{s.text}</p>
            </Card>
          ))}
        </ol>
      </section>

      <section className={SECTION}>
        <h2 className="text-3xl font-black">Ne taşıyoruz?</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services(settings).map((s) => (
            <Card key={s.title} className="flex items-center gap-4 p-5">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center">
                <Sticker name={s.sticker} className="max-h-20 w-20 object-contain" />
              </span>
              <div>
                <h3 className="text-lg font-black tracking-tight">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.text}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className={SECTION} aria-labelledby="teslim-kaniti">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 id="teslim-kaniti" className="text-3xl font-black sm:text-4xl">
              Teslim kanıtı, her siparişte.
            </h2>
            <p className="mt-3 max-w-xl text-lg font-medium text-neo-muted-dark">
              Süreli işlerde &quot;teslim edildi mi?&quot; sorusu kalmasın. Kurye teslimatta kanıtı toplar, sipariş kaydında saklanır.
            </p>
            <ul className="mt-6 grid grid-cols-2 gap-3">
              {[
                ["Fotoğraf", "Kurye teslim anında fotoğraf çeker."],
                ["Ad ve imza", "Teslim alan kişinin adı ve imzası."],
                ["Saat", "Teslim saati sipariş kaydına işlenir."],
                ["Teslim kodu", "İsterseniz alıcıya SMS ile kod gider; kod olmadan teslim edilmez."],
              ].map(([t, d]) => (
                <li key={t} className="rounded-2xl bg-white/70 p-4">
                  <div className="font-black text-brand">{t}</div>
                  <div className="mt-0.5 text-sm text-slate-600">{d}</div>
                </li>
              ))}
            </ul>
          </div>
          <ProofMock />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4" aria-labelledby="taahhutler">
        <div className="rounded-[32px] bg-brand p-6 text-white sm:p-10">
          <h2 id="taahhutler" className="text-2xl font-black sm:text-3xl">
            Taahhütlerimiz
          </h2>
          <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4 lg:gap-8">
            {promises(settings).map((p) => (
              <li key={p.title} className="border-t border-white/15 pt-4">
                {/* Fixed-height slot keeps the numbers aligned across stickers of different proportions */}
                <div className="mb-3 flex h-14 items-end">
                  <Sticker name={p.sticker} className="max-h-14 w-12 object-contain [object-position:left_bottom]" />
                </div>
                <div className="text-3xl font-black tracking-[-0.04em] text-accent sm:text-4xl">{p.big}</div>
                <div className="mt-2 font-extrabold">{p.title}</div>
                <p className="mt-1 text-sm text-white/70">{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={SECTION}>
        <div className="grid items-center gap-8 rounded-[32px] bg-white p-8 lg:grid-cols-[1fr_auto] lg:p-12">
          <div className="flex items-start gap-5">
            <Sticker name="bina" className="hidden w-24 shrink-0 -rotate-6 sm:block" />
            <div>
              <h2 className="text-2xl font-extrabold">
                {firstTier ? `Ayda ${firstTier.minDeliveries} ve üzeri gönderiniz mi var?` : "Düzenli gönderiniz mi var?"}
              </h2>
              <p className="mt-2 max-w-2xl text-neo-muted-dark">
                Kurumsal hesapla {corporateRows(settings)
                  .map((r) => `${r.label.toLocaleLowerCase("tr-TR")} ${r.value}`)
                  .join(", ")}
                ; tüm ay tek faturada. Ekibiniz aynı hesaptan sipariş verir, isterseniz sisteminize API ile bağlanırız.
              </p>
            </div>
          </div>
          <Link href="/kurumsal" className="flex min-h-14 items-center justify-center rounded-full bg-brand px-7 text-center text-lg font-extrabold text-white hover:bg-black">
            Kurumsal teklif al
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 lg:pb-20">
        <h2 className="text-3xl font-black">Hizmet bölgeleri</h2>
        <p className="mt-2 text-slate-600">Anadolu yakasının tamamına ve Avrupa yakasına (köprü geçiş ücretiyle) hizmet veriyoruz.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {DISTRICTS.map((d) => (
            <Link key={d.slug} href={`/hizmet-bolgeleri/${d.slug}`} className="rounded-full bg-white px-4 py-2 text-sm font-bold hover:bg-brand hover:text-white">
              {d.name} kurye
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4" aria-labelledby="sss-baslik">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="flex items-start justify-between gap-4">
              <h2 id="sss-baslik" className="text-3xl font-black sm:text-4xl">
                Sık sorulanlar
              </h2>
              <Sticker name="telefon" className="w-14 shrink-0 rotate-6 lg:-mt-2 lg:w-20" />
            </div>
            <HandNote className="mt-3 -rotate-3">kısa cevaplar</HandNote>
            <p className="mt-4 max-w-sm text-neo-muted-dark">Fiyat, teslimat, ödeme ve fatura hakkında en çok sorulanlar. Fazlası SSS sayfasında.</p>
            <Link href="/sss" className="mt-5 inline-flex min-h-12 items-center rounded-full bg-white px-6 font-extrabold text-brand hover:bg-brand hover:text-white">
              Tüm sorular →
            </Link>
          </div>
          <FaqAccordion items={faqItems(settings).slice(0, 5)} />
        </div>
      </section>
    </>
  );
}
