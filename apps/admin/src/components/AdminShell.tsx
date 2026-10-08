"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BRAND } from "@yazgan/shared";
import { repo } from "@/lib/repo";

const NAV = [
  { href: "/", label: "Genel bakış" },
  { href: "/siparisler", label: "Siparişler" },
  { href: "/harita", label: "Canlı harita" },
  { href: "/raporlar", label: "Raporlar" },
  { href: "/kuryeler", label: "Kuryeler" },
  { href: "/vardiyalar", label: "Çalışma saatleri (BTK)" },
  { href: "/musteriler", label: "Müşteriler" },
  { href: "/kurumsal", label: "Kurumsal & fatura" },
  { href: "/faturalar", label: "Faturalar" },
  { href: "/asistan", label: "Asistan konuşmaları" },
  { href: "/fiyatlar", label: "Fiyatlar" },
  { href: "/otomasyon", label: "Otomasyon" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<{ fullName: string | null } | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const isLogin = pathname === "/giris";
  // Herkese açık sayfalar (müşteri/alıcı takip linki) yönetici girişi gerektirmez
  const isPublic = pathname.startsWith("/takip/") || ["/gizlilik", "/kvkk", "/hesap-silme"].includes(pathname);

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

  if (isLogin || isPublic) return <>{children}</>;
  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Yükleniyor…</div>;
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="bg-brand text-white md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0">
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-extrabold tracking-tight">
            {BRAND.name}
          </Link>
          <button className="rounded px-2 py-1 text-sm md:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Menü">
            ☰
          </button>
        </div>
        <nav className={`${menuOpen ? "block" : "hidden"} px-2 pb-4 md:block`}>
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className={`block rounded-lg px-3 py-2 text-sm ${active ? "bg-white/15 font-semibold" : "text-white/85 hover:bg-white/10"}`}
              >
                {n.label}
              </Link>
            );
          })}
          <div className="mt-6 border-t border-white/15 px-3 pt-4 text-xs text-white/70">
            {admin.fullName ?? "Yönetici"}
            <button className="mt-2 block text-white underline" onClick={() => repo.signOut()}>
              Çıkış yap
            </button>
          </div>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {repo.mode === "demo" ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <b>Demo modu:</b> Supabase bağlantısı yapılmadı; örnek verilerle çalışıyorsunuz. Değişiklikler sayfa
            yenilenince sıfırlanır.
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
