import { BRAND } from "@yazgan/shared";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { APP_URL } from "@/lib/site";

const NAV = [
  { href: "/fiyatlar", label: "Fiyatlar" },
  { href: "/kurumsal", label: "Kurumsal" },
  { href: "/hizmet-bolgeleri", label: "Hizmet bölgeleri" },
  { href: "/sss", label: "SSS" },
  { href: "/iletisim", label: "İletişim" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-30 bg-neo-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label={`${BRAND.name} ana sayfa`} className="text-brand">
          <Wordmark small />
        </Link>
        <nav className="hidden items-center gap-1 rounded-full bg-white p-1.5 text-sm font-bold md:flex" aria-label="Ana menü">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="flex min-h-11 items-center rounded-full px-4 hover:bg-neo-bg">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href={APP_URL} className="flex min-h-12 items-center rounded-full bg-brand px-5 text-sm font-extrabold whitespace-nowrap text-white hover:bg-black">
            Sipariş ver
          </a>
          <details className="relative md:hidden">
            <summary className="flex h-12 w-12 cursor-pointer list-none items-center justify-center rounded-full bg-white text-lg shadow-sm" aria-label="Menü">
              ☰
            </summary>
            <nav className="absolute right-0 mt-2 w-60 rounded-[28px] bg-white p-2 shadow-lg" aria-label="Mobil menü">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-2xl px-4 py-3 text-base font-extrabold hover:bg-neo-bg">
                  {n.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
