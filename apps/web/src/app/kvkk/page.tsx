import { AYDINLATMA_METNI, BASVURU_AYDINLATMA, KVKK_VERSION } from "@yazgan/shared";
import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "KVKK Aydınlatma Metni", alternates: { canonical: "/kvkk" } };

export default function KvkkPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 pt-10 lg:pt-14">
      <PageHero title="KVKK Aydınlatma Metni" lead={<span className="text-base">Sürüm: {KVKK_VERSION}</span>} />
      <Card className="mt-8 p-6 sm:p-10">
        <div className="whitespace-pre-line leading-relaxed text-slate-700">{AYDINLATMA_METNI}</div>
        <h2 className="mt-10 scroll-mt-24 text-2xl font-black text-brand" id="basvuru">
          Web formları ve kurye başvuruları
        </h2>
        <div className="mt-3 whitespace-pre-line leading-relaxed text-slate-700">{BASVURU_AYDINLATMA}</div>
      </Card>
    </article>
  );
}
