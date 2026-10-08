import { BRAND } from "@yazgan/shared";

/** Sitenin kök adresi (canonical, sitemap). Vercel'de NEXT_PUBLIC_SITE_URL ile değiştirilebilir. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || BRAND.siteUrl).replace(/\/$/, "");
/** Tarayıcıdan sipariş uygulaması (Expo web derlemesi) */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || BRAND.appUrl).replace(/\/$/, "");

export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export function whatsappLink(text?: string): string | null {
  if (!BRAND.whatsapp) return null;
  const n = BRAND.whatsapp.replace(/\D/g, "");
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export const phoneLink = BRAND.phone ? `tel:${BRAND.phone.replace(/\s/g, "")}` : null;

/** "+905321112233" → "0532 111 22 33" */
export function displayPhone(e164: string): string {
  const d = e164.replace(/\D/g, "").replace(/^90/, "");
  return d.length === 10 ? `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}` : e164;
}
