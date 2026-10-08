import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { FAQ } from "@/lib/faq";

export const metadata: Metadata = {
  title: "Sık sorulan sorular",
  description: "Moto kurye fiyatları, teslim süresi, takip, ödeme, fatura ve kurumsal indirim hakkında sık sorulan sorular.",
  alternates: { canonical: "/sss" },
};

export default function SssPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
      <h1 className="text-3xl font-extrabold text-slate-900">Sık sorulan sorular</h1>
      <div className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200">
        {FAQ.map((f) => (
          <section key={f.q} className="p-5">
            <h2 className="font-bold text-slate-900">{f.q}</h2>
            <p className="mt-2 text-slate-600">{f.a}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
