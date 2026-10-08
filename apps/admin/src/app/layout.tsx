import type { Metadata } from "next";
import { AdminShell } from "@/components/AdminShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yazgan Kurye — Yönetim",
  description: "Sipariş, kurye ve fiyat yönetimi",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
