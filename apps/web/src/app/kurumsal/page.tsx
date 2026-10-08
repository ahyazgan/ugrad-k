import { BRAND } from "@yazgan/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { LeadForm } from "@/components/LeadForm";
import { Sticker } from "@/components/Sticker";
import { corporateRows } from "@/lib/pricing-info";

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

export default function KurumsalPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">Kurumsal moto kurye</h1>
            <Sticker name="hediye" priority className="w-16 shrink-0 rotate-6 sm:w-20" />
          </div>
          <p className="mt-3 text-lg text-slate-600">
            Hukuk büroları, muhasebe ofisleri, ajanslar ve şirketler için düzenli ve acil evrak/paket teslimatı. Başvurunuzu bırakın, en kısa sürede sizi arayalım.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-2xl border border-slate-200 p-4">
                <div className="font-bold text-slate-900">{b.title}</div>
                <p className="mt-1 text-sm text-slate-600">{b.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-slate-600">
            Yazılım ekibiniz mi var?{" "}
            <Link href="/api-belgeleri" className="font-semibold text-brand underline">
              API belgelerine göz atın
            </Link>
            .
          </p>
        </div>
        <div>
          <h2 className="mb-3 text-xl font-bold text-slate-900">Kurumsal hesap başvurusu</h2>
          <LeadForm kind="kurumsal" sourcePage="/kurumsal" />
        </div>
      </div>
    </div>
  );
}
