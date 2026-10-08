import { BRAND } from "@yazgan/shared";
import type { Metadata } from "next";
import { CourierApplyForm } from "@/components/CourierApplyForm";
import { Sticker } from "@/components/Sticker";

export const metadata: Metadata = {
  title: "Moto kurye iş ilanı — kurye olun",
  description: `${BRAND.name} moto kurye alımı: Anadolu yakasında tam veya yarı zamanlı moto kurye olarak çalışın. Başvuru formu.`,
  alternates: { canonical: "/kurye-ol" },
};

const PERKS = [
  { title: "Düzenli iş", text: "Ağırlıklı kurumsal ve acil evrak işleri; işler size uygulamadan, yakınlığınıza göre otomatik atanır." },
  { title: "Anadolu yakası", text: "Merkez Beykoz; işlerin çoğu Anadolu yakasında, gerektiğinde Avrupa yakasına geçiş." },
  { title: "Kolay uygulama", text: "Vardiya, iş listesi, yol tarifi ve teslim kanıtı tek ekranda. Çalışma saatleriniz otomatik kayıt altında." },
];

export default function KuryeOlPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1fr_560px]">
      <div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">Moto kurye olun</h1>
          <Sticker name="kask" priority className="w-16 shrink-0 -rotate-6 sm:w-20" />
        </div>
        <p className="mt-3 text-lg text-slate-600">{BRAND.name} ekibine katılın. Formu doldurun; başvurunuzu inceleyip görüşme için sizi arayalım.</p>
        <div className="mt-8 grid gap-4">
          {PERKS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-slate-200 p-4">
              <div className="font-bold text-slate-900">{p.title}</div>
              <p className="mt-1 text-sm text-slate-600">{p.text}</p>
            </div>
          ))}
        </div>
        <h2 className="mt-8 text-lg font-bold text-slate-900">Aranan şartlar</h2>
        <ul className="mt-2 space-y-1 text-slate-700">
          <li>• 18 yaşını doldurmuş olmak</li>
          <li>• Motosiklet kullanmaya uygun geçerli ehliyet</li>
          <li>• Akıllı telefon (Android veya iPhone)</li>
          <li>• Tercihen kendi motosikleti</li>
        </ul>
      </div>
      <div>
        <h2 className="mb-3 text-xl font-bold text-slate-900">Başvuru formu</h2>
        <CourierApplyForm />
      </div>
    </div>
  );
}
