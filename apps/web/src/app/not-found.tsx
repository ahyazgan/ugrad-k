import Link from "next/link";
import { Sticker } from "@/components/Sticker";
import { CARD, HandNote } from "@/components/ui";

const SHORTCUTS = [
  { href: "/fiyatlar", label: "Fiyat hesapla", text: "Adresleri yazın, kalemleri görün." },
  { href: "/hizmet-bolgeleri", label: "Hizmet bölgeleri", text: "Gittiğimiz ilçeler ve semtler." },
  { href: "/sss", label: "SSS", text: "Fiyat, teslimat, ödeme ve fatura." },
];

export default function NotFound() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 text-center lg:pt-14">
      <h1>
        <span className="sr-only">Sayfa bulunamadı (404)</span>
        <span
          aria-hidden="true"
          className="inline-flex items-center justify-center text-[clamp(128px,28vw,240px)] leading-[0.85] font-black tracking-[-0.06em] text-brand"
        >
          4
          <Sticker name="pin" priority className="mx-1 w-24 -rotate-6 sm:mx-2 sm:w-28" />4
        </span>
      </h1>
      <HandNote className="mt-1 -rotate-3 text-3xl">yanlış adres!</HandNote>
      <p className="mt-6 text-3xl font-extrabold tracking-[-0.03em] text-brand sm:text-4xl">Kurye bu adresi bulamadı.</p>
      <p className="mt-2 text-neo-muted-dark">Sayfa taşınmış ya da kaldırılmış olabilir. Şu kısa yollardan biriyle devam edin:</p>
      <ul className="mx-auto mt-8 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
        {SHORTCUTS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className={`${CARD} group flex h-full items-center justify-between gap-3 p-5 transition hover:-translate-y-0.5`}>
              <span>
                <span className="block text-lg font-black tracking-tight text-brand">{s.label}</span>
                <span className="block text-sm text-neo-muted">{s.text}</span>
              </span>
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent font-black text-brand transition group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/" className="mt-8 inline-block text-sm font-bold text-brand underline">
        Ana sayfaya dön
      </Link>
    </div>
  );
}
