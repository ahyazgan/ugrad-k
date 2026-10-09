import { GIZLILIK_POLITIKASI } from "@yazgan/shared";
import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Gizlilik Politikası", alternates: { canonical: "/gizlilik" } };

export default function GizlilikPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 pt-10 lg:pt-14">
      <PageHero title="Gizlilik Politikası" sticker="kilit" />
      <Card className="mt-8 p-6 sm:p-10">
        <div className="whitespace-pre-line leading-relaxed text-slate-700">{GIZLILIK_POLITIKASI}</div>
      </Card>
    </article>
  );
}
