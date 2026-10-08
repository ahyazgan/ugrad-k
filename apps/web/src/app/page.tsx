import { BRAND } from "@yazgan/shared";
import Link from "next/link";
import { PriceCalculator } from "@/components/PriceCalculator";
import { DISTRICTS } from "@/lib/districts";
import { FAQ } from "@/lib/faq";
import { corporateRows } from "@/lib/pricing-info";
import { APP_URL, whatsappLink } from "@/lib/site";

const STEPS = [
  { n: "1", title: "Adresleri girin", text: "Alış ve teslim adresini yazın; sürüş mesafesine göre fiyat anında çıkar." },
  { n: "2", title: "Onaylayın", text: "Telefon numaranızla giriş yapın, kartla ya da teslimatta ödeyin." },
  { n: "3", title: "Canlı takip edin", text: "Kuryeniz haritada; takip bağlantısını alıcıyla paylaşın." },
  { n: "4", title: "Teslim kanıtı", text: "Teslimatta fotoğraf ve imza alınır, faturanız otomatik kesilir." },
];

const SERVICES = [
  { title: "Acil evrak", text: "Sözleşme, vekâletname, ihale dosyası: 60 dakika içinde teslim hedefiyle, başka iş yapılmadan doğrudan." },
  { title: "Adliye ve resmi kurum", text: "Anadolu ve İstanbul adliyelerine, icra dairelerine, noterlere dosya ve dilekçe teslimi." },
  { title: "Gidiş-dönüş imza", text: "Belgeyi götürür, imzalatır, geri getiririz. Dönüş ayağı yarı fiyatına." },
  { title: "Planlı gönderi", text: "Yarın sabah için şimdiden sipariş verin; kurye alış saatinden önce yola çıkar." },
  { title: "Numune ve küçük paket", text: "Yedek parça, numune, ilaç dışı sağlık malzemesi ve küçük paketler." },
  { title: "Kurumsal hesap", text: "Aylık hacme göre indirim, tek fatura, ekip için ortak hesap ve API entegrasyonu." },
];

export default function Home() {
  const wa = whatsappLink("Merhaba, kurye istiyorum.");
  return (
    <>
      <section>
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-10 lg:grid-cols-2 lg:py-16">
          <div className="relative lg:pt-6">
            <p className="inline-flex items-center gap-2 rounded-full bg-brand px-3.5 py-2 text-xs font-extrabold tracking-[0.12em] text-accent">
              <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
              BEYKOZ · ANADOLU YAKASI ÖNCELİKLİ · TÜM İSTANBUL
            </p>
            <h1 className="mt-5 text-[clamp(56px,9vw,112px)] leading-[0.9] font-black tracking-[-0.05em]">
              Hızlı.
              <br />
              Net.
              <br />
              <span className="bg-[linear-gradient(transparent_68%,var(--color-neo-lime)_68%,var(--color-neo-lime)_92%,transparent_92%)]">Kapında.</span>
            </h1>
            <span
              aria-hidden="true"
              className="absolute top-24 right-2 hidden -rotate-12 rounded-xl bg-accent px-3 pt-1.5 pb-1 font-[family-name:var(--font-hand)] text-2xl leading-none sm:inline-block"
            >
              MESAFE
              <br />
              YOK
            </span>
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
            <h2 className="mb-3 text-2xl font-black">Fiyatı hemen hesaplayın</h2>
            <PriceCalculator />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-black">Nasıl çalışır?</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-[26px] bg-white p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-black text-brand">{s.n}</div>
              <div className="mt-3 text-lg font-black tracking-tight">{s.title}</div>
              <p className="mt-1 text-sm text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-black">Ne taşıyoruz?</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <div key={s.title} className="rounded-[26px] bg-white p-5">
                <div className="text-lg font-black tracking-tight">{s.title}</div>
                <p className="mt-1 text-sm text-slate-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid items-center gap-8 rounded-[32px] bg-brand p-8 text-white lg:grid-cols-[1fr_auto] lg:p-12">
          <div>
            <h2 className="text-2xl font-extrabold">Ayda 20&apos;den fazla gönderiniz mi var?</h2>
            <p className="mt-2 max-w-2xl text-white/80">
              Kurumsal hesapla {corporateRows()
                .map((r) => `${r.label.toLocaleLowerCase("tr-TR")} ${r.value}`)
                .join(", ")}
              ; tüm ay tek faturada. Ekibiniz aynı hesaptan sipariş verir, isterseniz sisteminize API ile bağlanırız.
            </p>
          </div>
          <Link href="/kurumsal" className="flex min-h-14 items-center justify-center rounded-full bg-accent px-7 text-center text-lg font-extrabold text-brand hover:bg-accent-dark">
            Kurumsal teklif al
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
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

      <section className="mx-auto max-w-3xl px-4 pb-8">
        <h2 className="text-3xl font-black">Sık sorulanlar</h2>
        <div className="mt-4 divide-y divide-neo-bg rounded-[26px] bg-white">
          {FAQ.slice(0, 5).map((f) => (
            <details key={f.q} className="group p-4">
              <summary className="cursor-pointer list-none font-semibold text-slate-900">{f.q}</summary>
              <p className="mt-2 text-sm text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
        <Link href="/sss" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">
          Tüm sorular →
        </Link>
      </section>
    </>
  );
}
