import { BRAND } from "@yazgan/shared";
import Link from "next/link";
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
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-brand">
          {BRAND.name}
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-700 md:flex" aria-label="Ana menü">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-brand">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href={APP_URL} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-slate-900 hover:bg-amber-400">
            Sipariş ver
          </a>
          <details className="relative md:hidden">
            <summary className="cursor-pointer list-none rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Menü">
              ☰
            </summary>
            <nav className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg" aria-label="Mobil menü">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50">
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
