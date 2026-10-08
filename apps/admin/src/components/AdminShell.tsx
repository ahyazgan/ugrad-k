"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BRAND } from "@yazgan/shared";
import { SosBanner } from "@/components/SosBanner";
import { cx } from "@/components/ui";
import { loadNavCounts, type NavCounts } from "@/lib/alerts";
import { repo } from "@/lib/repo";

type BadgeKey = keyof NavCounts;
interface NavItem {
  href: string;
  label: string;
  badge?: BadgeKey;
}

const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Operasyon",
    items: [
      { href: "/", label: "Genel bakış" },
      { href: "/siparisler", label: "Siparişler", badge: "unassigned" },
      { href: "/harita", label: "Canlı harita" },
      { href: "/yogunluk", label: "Talep yoğunluğu" },
      { href: "/raporlar", label: "Raporlar" },
    ],
  },
  {
    group: "Kuryeler",
    items: [
      { href: "/kuryeler", label: "Kuryeler" },
      { href: "/hakedis", label: "Hakediş ve tahsilat" },
      { href: "/primler", label: "Kurye primleri" },
      { href: "/vardiya-plani", label: "Vardiya planı" },
      { href: "/vardiyalar", label: "Çalışma saatleri (BTK)" },
    ],
  },
  {
    group: "Müşteri ve finans",
    items: [
      { href: "/musteriler", label: "Müşteriler" },
      { href: "/basvurular", label: "Başvurular", badge: "newApplications" },
      { href: "/kurumsal", label: "Kurumsal & fatura" },
      { href: "/faturalar", label: "Faturalar", badge: "failedInvoices" },
      { href: "/asistan", label: "Asistan konuşmaları", badge: "handoff" },
    ],
  },
  {
    group: "Ayarlar",
    items: [
      { href: "/fiyatlar", label: "Fiyatlar" },
      { href: "/kampanyalar", label: "Kampanyalar" },
      { href: "/otomasyon", label: "Otomasyon" },
    ],
  },
];

/** Screen-reader description for each badge (kept out of the link's accessible name) */
const BADGE_TEXT: Record<BadgeKey, (n: number) => string> = {
  unassigned: (n) => `Atama bekleyen: ${n}`,
  newApplications: (n) => `Yeni başvuru: ${n}`,
  failedInvoices: (n) => `Kesilemeyen fatura: ${n}`,
  handoff: (n) => `Temsilci bekleyen konuşma: ${n}`,
};

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<{ fullName: string | null } | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [counts, setCounts] = useState<NavCounts | null>(null);
  const isLogin = pathname === "/giris";
  // Public pages (customer/recipient tracking link, legal pages) do not require an admin session
  const isPublic = pathname.startsWith("/takip/") || ["/gizlilik", "/kvkk", "/hesap-silme"].includes(pathname);
  const signedIn = !!admin;

  useEffect(() => {
    const check = () => repo.currentAdmin().then(setAdmin);
    check();
    return repo.onAuthChange(check);
  }, []);

  useEffect(() => {
    if (isPublic) return;
    if (admin === null && !isLogin) router.replace("/giris");
    if (admin && isLogin) router.replace("/");
  }, [admin, isLogin, isPublic, router]);

  // Badge counters: refreshed on navigation (throttled in loadNavCounts) and every 60 s
  useEffect(() => {
    if (!signedIn || isPublic || isLogin) return;
    let alive = true;
    const load = (force = false) => loadNavCounts(force).then((c) => alive && setCounts(c));
    load();
    const t = setInterval(() => load(true), 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [signedIn, pathname, isPublic, isLogin]);

  if (isLogin || isPublic) return <>{children}</>;
  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-muted">Yükleniyor…</div>;
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="bg-brand text-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" className="text-lg font-extrabold tracking-[-0.03em]">
            {BRAND.name}
            <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Yönetim</span>
          </Link>
          <button className="rounded-control px-2 py-1 text-sm md:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Menü" aria-expanded={menuOpen}>
            ☰
          </button>
        </div>
        <nav className={cx(menuOpen ? "block" : "hidden", "px-3 pb-4 md:block md:flex-1 md:overflow-y-auto")}>
          {NAV.map((g) => (
            <div key={g.group} className="mb-3">
              <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/40">{g.group}</div>
              {g.items.map((n) => {
                const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
                const count = n.badge && counts ? counts[n.badge] : 0;
                const descId = n.badge ? `nav-badge-${n.badge}` : undefined;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    aria-describedby={count ? descId : undefined}
                    className={cx(
                      "relative flex items-center justify-between gap-2 rounded-control px-3 py-[7px] text-sm transition",
                      active
                        ? "bg-brand-light font-semibold text-brand before:absolute before:-left-3 before:top-1 before:bottom-1 before:w-[3px] before:rounded-r-full before:bg-accent"
                        : "text-white/80 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <span className="truncate">{n.label}</span>
                    {count && n.badge ? (
                      <>
                        <span
                          aria-hidden="true"
                          className={cx(
                            "min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold leading-5 tabular-nums",
                            n.badge === "failedInvoices" ? "bg-red-500 text-white" : active ? "bg-brand text-white" : "bg-accent text-brand",
                          )}
                        >
                          {count}
                        </span>
                        <span id={descId} hidden>
                          {BADGE_TEXT[n.badge](count)}
                        </span>
                      </>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="mt-4 border-t border-white/10 px-3 pt-4 text-xs text-white/60">
            {admin.fullName ?? "Yönetici"}
            <button className="mt-2 block text-white underline underline-offset-2" onClick={() => repo.signOut()}>
              Çıkış yap
            </button>
          </div>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">
        <div className="mx-auto max-w-[1600px]">
          {repo.mode === "demo" ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-control border border-amber-200 bg-amber-50 px-3 py-1.5 text-[13px] text-amber-900">
              <span className="rounded bg-amber-200/70 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">Demo modu</span>
              Supabase bağlantısı yapılmadı; örnek verilerle çalışıyorsunuz. Değişiklikler sayfa yenilenince sıfırlanır.
            </div>
          ) : null}
          <SosBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
