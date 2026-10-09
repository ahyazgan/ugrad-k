import { BRAND } from "@yazgan/shared";
import type { Metadata } from "next";
import { AdminShell } from "@/components/AdminShell";
// Self-hosted variable font (same package as apps/web): no Google Fonts fetch at build time
import "@fontsource-variable/archivo/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: `${BRAND.name} — Yönetim`,
  description: "Sipariş, kurye ve fiyat yönetimi",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full bg-canvas text-slate-900">
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
