import { BRAND } from "@yazgan/shared";
import type { Metadata } from "next";
import { CourierApplyForm } from "@/components/CourierApplyForm";
import { PageHero } from "@/components/PageHero";
import { Sticker } from "@/components/Sticker";
import { Card } from "@/components/ui";

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

const REQUIREMENTS = ["18 yaşını doldurmuş olmak", "Motosiklet kullanmaya uygun geçerli ehliyet", "Akıllı telefon (Android veya iPhone)", "Tercihen kendi motosikleti"];

const TIMELINE = [
  { title: "Form", text: "Bu sayfadaki formu doldurun. Belgeleri şimdi yükleyebilir ya da görüşmeye getirebilirsiniz." },
  { title: "Görüşme", text: "Başvurunuzu inceleyip sizi arıyor, çalışma şeklini birlikte konuşuyoruz." },
  { title: "Belge kontrolü", text: "Ehliyetiniz (ön ve arka yüz), motosiklet ruhsatınız ve vesikalık fotoğrafınız kontrol edilir." },
  { title: "Uygulama kurulumu", text: "Kurye uygulamasına giriş yaparsınız; vardiya, iş listesi ve teslim kanıtı oradan yürür." },
];

export default function KuryeOlPage() {
  return (
    <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 pt-10 lg:grid-cols-[minmax(0,1fr)_560px] lg:gap-12 lg:pt-14">
      <div>
        <PageHero
          title="Moto kurye olun"
          sticker="kask"
          tilt="left"
          lead={`${BRAND.name} ekibine katılın. Formu doldurun; başvurunuzu inceleyip görüşme için sizi arayalım.`}
        />
        <div className="mt-8 grid gap-4">
          {PERKS.map((p) => (
            <Card key={p.title} className="p-5">
              <h2 className="font-black tracking-tight text-brand">{p.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{p.text}</p>
            </Card>
          ))}
        </div>

        <Card className="mt-4 p-5">
          <h2 className="font-black tracking-tight text-brand">Aranan şartlar</h2>
          <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            {REQUIREMENTS.map((r) => (
              <li key={r} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-black text-brand">
                  ✓
                </span>
                {r}
              </li>
            ))}
          </ul>
        </Card>

        <section className="mt-12" aria-labelledby="sonra">
          <div className="flex items-end justify-between gap-4">
            <h2 id="sonra" className="text-2xl font-black tracking-[-0.03em]">
              Başvurudan sonra
            </h2>
            <Sticker name="telefon" className="w-14 shrink-0 rotate-6 lg:w-16" />
          </div>
          <ol className="relative mt-5 grid gap-5 pl-14">
            {/* Vertical rail */}
            <span aria-hidden="true" className="absolute top-2 bottom-2 left-[19px] w-0.5 rounded-full bg-brand/15" />
            {TIMELINE.map((t, i) => (
              <li key={t.title} className="relative">
                <span className="absolute top-0 -left-14 flex h-10 w-10 items-center justify-center rounded-full bg-brand font-black text-accent">{i + 1}</span>
                <div className="font-black text-brand">{t.title}</div>
                <p className="mt-0.5 text-sm text-slate-600">{t.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div>
        <h2 className="mb-3 text-2xl font-black tracking-[-0.03em]">Başvuru formu</h2>
        <CourierApplyForm />
      </div>
    </div>
  );
}
