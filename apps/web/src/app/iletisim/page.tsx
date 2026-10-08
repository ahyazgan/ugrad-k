import { BRAND, COMPANY } from "@yazgan/shared";
import type { Metadata } from "next";
import { LeadForm } from "@/components/LeadForm";
import { displayPhone, phoneLink, whatsappLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "İletişim",
  description: `${BRAND.name} iletişim bilgileri: adres, e-posta, WhatsApp. Beykoz / İstanbul.`,
  alternates: { canonical: "/iletisim" },
};

export default function IletisimPage() {
  const wa = whatsappLink("Merhaba,");
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-2">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900">İletişim</h1>
        <dl className="mt-6 space-y-4 text-slate-700">
          <div>
            <dt className="text-sm font-semibold text-slate-500">Adres</dt>
            <dd>{COMPANY.address}</dd>
          </div>
          {phoneLink ? (
            <div>
              <dt className="text-sm font-semibold text-slate-500">Telefon</dt>
              <dd>
                <a href={phoneLink} className="text-brand underline">
                  {displayPhone(BRAND.phone)}
                </a>
              </dd>
            </div>
          ) : null}
          {wa ? (
            <div>
              <dt className="text-sm font-semibold text-slate-500">WhatsApp (7/24 asistan)</dt>
              <dd>
                <a href={wa} className="text-brand underline">
                  WhatsApp&apos;tan yazın
                </a>
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-sm font-semibold text-slate-500">E-posta</dt>
            <dd>
              <a href={`mailto:${BRAND.email.info}`} className="text-brand underline">
                {BRAND.email.info}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-slate-500">E-postayla sipariş</dt>
            <dd>
              <a href={`mailto:${BRAND.email.orders}`} className="text-brand underline">
                {BRAND.email.orders}
              </a>
              <span className="block text-sm text-slate-500">Kayıtlı müşterilerimiz alış/teslim adresini yazarak sipariş verebilir.</span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-slate-500">Unvan</dt>
            <dd className="text-sm">{COMPANY.title}</dd>
          </div>
        </dl>
      </div>
      <div>
        <h2 className="mb-3 text-xl font-bold text-slate-900">Bize yazın</h2>
        <LeadForm kind="iletisim" sourcePage="/iletisim" />
      </div>
    </div>
  );
}
