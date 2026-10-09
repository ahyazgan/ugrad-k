import { BRAND, COMPANY, type PricingSettings } from "@yazgan/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { LeadForm } from "@/components/LeadForm";
import { PageHero } from "@/components/PageHero";
import { Sticker, type StickerName } from "@/components/Sticker";
import { Card, CARD } from "@/components/ui";
import { getPricingSettings } from "@/lib/pricing-settings";
import { displayPhone, phoneLink, whatsappLink } from "@/lib/site";

// ISR: the head office pin comes from pricing_settings (service centre); re-read at most once an hour.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "İletişim",
  description: `${BRAND.name} iletişim bilgileri: adres, e-posta, WhatsApp. Beykoz / İstanbul.`,
  alternates: { canonical: "/iletisim" },
};

const QUICK: { href: string; title: string; text: string; sticker: StickerName; tilt: string }[] = [
  { href: "/fiyatlar", title: "Fiyat", text: "Adresleri yazın, fiyatı kalem kalem görün.", sticker: "fis", tilt: "rotate-6" },
  { href: "/kurumsal", title: "Kurumsal", text: "Aylık indirim, ay sonu tek fatura, ekip hesabı.", sticker: "bina", tilt: "-rotate-6" },
  { href: "/kurye-ol", title: "Kurye ol", text: "Ekibimize katılın; formu doldurun, sizi arayalım.", sticker: "kask", tilt: "rotate-3" },
];

/** Stylised (not geographic) street sketch around the head office; the real map opens on OpenStreetMap via link only. */
function HeadOfficeCard({ settings }: { settings: PricingSettings }) {
  const { serviceCenterLat: lat, serviceCenterLng: lng } = settings;
  const osm = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  return (
    <Card className="overflow-hidden">
      <div className="relative h-40 bg-[#f3fcd2]" aria-hidden="true">
        <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
          <path d="M-10 118 C80 96 150 104 220 84 S340 40 420 46" fill="none" stroke="#fff" strokeWidth="18" strokeLinecap="round" />
          <path d="M120 -10 C126 40 136 90 150 170" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
          <path d="M270 -10 C262 50 280 110 300 170" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
          <path d="M-10 40 C60 46 110 30 160 34" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
          <circle cx="210" cy="86" r="26" fill="#d6fb45" opacity="0.6" />
        </svg>
        <Sticker name="pin" className="absolute top-3 left-1/2 w-14 -translate-x-1/2 -rotate-6" />
        <span className="absolute bottom-3 left-3 rounded-full bg-brand px-3 py-1 text-xs font-extrabold text-white">Beykoz · merkez</span>
      </div>
      <div className="p-5">
        <h2 className="font-black tracking-tight text-brand">Merkez ofis</h2>
        <p className="mt-1 text-sm text-slate-700">{COMPANY.address}</p>
        <p className="mt-1 text-xs text-neo-muted">Anadolu yakasına öncelikli çıkış noktamız.</p>
        <a href={osm} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-bold text-brand underline">
          Haritada aç ↗
        </a>
      </div>
    </Card>
  );
}

export default async function IletisimPage() {
  const settings = await getPricingSettings();
  const wa = whatsappLink("Merhaba,");
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 lg:pt-14">
      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-12">
        <div>
          <PageHero title="İletişim" sticker="telefon" lead="Sorunuz, teklif talebiniz ya da kurumsal başvurunuz için yazın; en kısa sürede dönelim." />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Card className="p-5">
              <dl className="space-y-4 text-slate-700">
                {phoneLink ? (
                  <div>
                    <dt className="text-xs font-bold tracking-wide text-neo-muted uppercase">Telefon</dt>
                    <dd>
                      <a href={phoneLink} className="font-bold text-brand underline">
                        {displayPhone(BRAND.phone)}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {wa ? (
                  <div>
                    <dt className="text-xs font-bold tracking-wide text-neo-muted uppercase">WhatsApp (7/24 asistan)</dt>
                    <dd>
                      <a href={wa} className="font-bold text-brand underline">
                        WhatsApp&apos;tan yazın
                      </a>
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs font-bold tracking-wide text-neo-muted uppercase">E-posta</dt>
                  <dd>
                    <a href={`mailto:${BRAND.email.info}`} className="font-bold break-all text-brand underline">
                      {BRAND.email.info}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold tracking-wide text-neo-muted uppercase">E-postayla sipariş</dt>
                  <dd>
                    <a href={`mailto:${BRAND.email.orders}`} className="font-bold break-all text-brand underline">
                      {BRAND.email.orders}
                    </a>
                    <span className="mt-0.5 block text-sm text-slate-500">Kayıtlı müşterilerimiz alış/teslim adresini yazarak sipariş verebilir.</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold tracking-wide text-neo-muted uppercase">Unvan</dt>
                  <dd className="text-sm">{COMPANY.title}</dd>
                </div>
              </dl>
            </Card>
            <HeadOfficeCard settings={settings} />
          </div>
        </div>
        <div className="lg:sticky lg:top-24">
          <h2 className="mb-3 text-2xl font-black tracking-[-0.03em]">Bize yazın</h2>
          <LeadForm kind="iletisim" sourcePage="/iletisim" />
        </div>
      </div>

      <section className="mt-14" aria-labelledby="kisa-yollar">
        <h2 id="kisa-yollar" className="text-2xl font-black tracking-[-0.03em]">
          Belki aradığınız şudur
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {QUICK.map((q) => (
            <li key={q.href}>
              <Link href={q.href} className={`${CARD} group flex h-full items-center gap-4 p-5 transition hover:-translate-y-0.5`}>
                <Sticker name={q.sticker} className={`w-12 shrink-0 ${q.tilt}`} />
                <span>
                  <span className="block text-lg font-black tracking-tight text-brand group-hover:underline">{q.title}</span>
                  <span className="block text-sm text-slate-600">{q.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
