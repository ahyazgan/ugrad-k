import { BRAND, COMPANY } from "@yazgan/shared";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { DISTRICTS } from "@/lib/districts";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND.name} — İstanbul moto kurye, acil evrak ve paket`,
    template: `%s | ${BRAND.name}`,
  },
  description: `${BRAND.slogan}. Anında fiyat, canlı takip, teslim kanıtı ve kurumsal aylık fatura. Merkez Beykoz, Anadolu yakası öncelikli.`,
  applicationName: BRAND.name,
  openGraph: { type: "website", locale: "tr_TR", siteName: BRAND.name, url: SITE_URL },
  alternates: { canonical: "/" },
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = { themeColor: BRAND.colors.primary };

/** Yerel işletme bilgisi: Google'ın harita ve yerel aramada kullandığı yapılandırılmış veri */
const localBusiness = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": `${SITE_URL}/#isletme`,
  name: BRAND.name,
  legalName: COMPANY.title,
  description: BRAND.slogan,
  url: SITE_URL,
  email: BRAND.email.info,
  ...(BRAND.phone ? { telephone: BRAND.phone } : {}),
  address: {
    "@type": "PostalAddress",
    streetAddress: "Kılıçlı Mah. Şile Cad. No: 8A",
    addressLocality: "Beykoz",
    addressRegion: "İstanbul",
    addressCountry: "TR",
  },
  areaServed: DISTRICTS.map((d) => ({ "@type": "City", name: `${d.name}, İstanbul` })),
  priceRange: "₺₺",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen antialiased">
        <JsonLd data={localBusiness} />
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
