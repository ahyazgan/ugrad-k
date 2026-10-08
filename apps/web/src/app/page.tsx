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
      <section className="bg-gradient-to-b from-brand-light to-white">
        <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 py-12 lg:grid-cols-2 lg:py-20">
          <div className="lg:pt-6">
            <p className="inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand shadow-sm">
              Beykoz merkezli · Anadolu yakası öncelikli · Tüm İstanbul
            </p>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Acil evrakınız <span className="text-brand">bir saatte</span> yerinde.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-slate-600">
              {BRAND.name}: hukuk büroları, muhasebeciler ve şirketler için moto kurye. Fiyatı önceden görün, kuryeyi canlı takip edin, teslim kanıtını alın.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href={APP_URL} className="rounded-xl bg-brand px-6 py-3 font-bold text-white hover:bg-brand-dark">
                Hemen sipariş ver
              </a>
              <Link href="/kurumsal" className="rounded-xl border border-brand px-6 py-3 font-bold text-brand hover:bg-white">
                Kurumsal hesap aç
              </Link>
              {wa ? (
                <a href={wa} className="rounded-xl border border-emerald-600 px-6 py-3 font-bold text-emerald-700 hover:bg-emerald-50">
                  WhatsApp
                </a>
              ) : null}
            </div>
            <ul className="mt-8 grid max-w-lg grid-cols-2 gap-3 text-sm text-slate-700">
              <li>✓ Gizli ücret yok, kalem kalem fiyat</li>
              <li>✓ Canlı konum takibi</li>
              <li>✓ Fotoğraf + imza ile teslim</li>
              <li>✓ Otomatik e-arşiv fatura</li>
            </ul>
          </div>
          <div>
            <h2 className="mb-3 text-lg font-bold text-slate-900">Fiyatı hemen hesaplayın</h2>
            <PriceCalculator />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-extrabold text-slate-900">Nasıl çalışır?</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-2xl border border-slate-200 p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand font-bold text-white">{s.n}</div>
              <div className="mt-3 font-bold text-slate-900">{s.title}</div>
              <p className="mt-1 text-sm text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-extrabold text-slate-900">Ne taşıyoruz?</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <div key={s.title} className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="font-bold text-slate-900">{s.title}</div>
                <p className="mt-1 text-sm text-slate-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid items-center gap-8 rounded-3xl bg-brand p-8 text-white lg:grid-cols-[1fr_auto] lg:p-12">
          <div>
            <h2 className="text-2xl font-extrabold">Ayda 20&apos;den fazla gönderiniz mi var?</h2>
            <p className="mt-2 max-w-2xl text-white/80">
              Kurumsal hesapla {corporateRows()
                .map((r) => `${r.label.toLocaleLowerCase("tr-TR")} ${r.value}`)
                .join(", ")}
              ; tüm ay tek faturada. Ekibiniz aynı hesaptan sipariş verir, isterseniz sisteminize API ile bağlanırız.
            </p>
          </div>
          <Link href="/kurumsal" className="rounded-xl bg-accent px-6 py-3 text-center font-bold text-slate-900 hover:bg-amber-400">
            Kurumsal teklif al
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="text-2xl font-extrabold text-slate-900">Hizmet bölgeleri</h2>
        <p className="mt-2 text-slate-600">Anadolu yakasının tamamına ve Avrupa yakasına (köprü geçiş ücretiyle) hizmet veriyoruz.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {DISTRICTS.map((d) => (
            <Link key={d.slug} href={`/hizmet-bolgeleri/${d.slug}`} className="rounded-full border border-slate-200 px-4 py-1.5 text-sm hover:border-brand hover:text-brand">
              {d.name} kurye
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-8">
        <h2 className="text-2xl font-extrabold text-slate-900">Sık sorulanlar</h2>
        <div className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200">
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
