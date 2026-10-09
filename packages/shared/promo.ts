/**
 * Kampanya kodları ve davet indirimi (sunucu doğrular; fiyat satırı "promo", eksi tutar).
 * İndirim taşıma bedeline uygulanır (köprü, bekleme, sigorta, uzak alış hariç: discountableKurus).
 */
import { applyCredit, discountableKurus, formatTL, type PriceQuote } from "./pricing.ts";

export type PromoKind = "yuzde" | "tutar";

export interface Promo {
  code: string;
  description: string | null;
  kind: PromoKind;
  /** yüzde için %, tutar için kuruş */
  value: number;
  /** Yüzde indirimde en fazla (kuruş) */
  maxDiscountKurus: number | null;
  minSubtotalKurus: number;
  validFrom: string | null;
  validUntil: string | null;
  maxRedemptions: number | null;
  perCustomerLimit: number;
  newCustomersOnly: boolean;
  /** Yalnız bu müşteriye özel (ör. geri kazanma kodu) */
  customerId: string | null;
  active: boolean;
}

export interface PromoUsage {
  now: Date;
  customerId: string;
  /** Müşterinin iptal edilmemiş sipariş sayısı */
  customerOrderCount: number;
  customerRedemptions: number;
  totalRedemptions: number;
}

export const normalizeCode = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

/** Kod kullanılamıyorsa Türkçe neden; kullanılabilirse null */
export function promoProblem(p: Promo, quote: Pick<PriceQuote, "lines" | "subtotalKurus">, u: PromoUsage): string | null {
  if (!p.active) return "Bu kampanya sona erdi";
  if (p.customerId && p.customerId !== u.customerId) return "Bu kod size ait değil";
  if (p.validFrom && u.now < new Date(p.validFrom)) return "Kampanya henüz başlamadı";
  if (p.validUntil && u.now > new Date(p.validUntil)) return "Kampanyanın süresi doldu";
  if (p.maxRedemptions != null && u.totalRedemptions >= p.maxRedemptions) return "Kampanya kullanım sınırına ulaştı";
  if (u.customerRedemptions >= p.perCustomerLimit) return "Bu kodu daha önce kullandınız";
  if (p.newCustomersOnly && u.customerOrderCount > 0) return "Bu kod yalnız ilk siparişte geçerli";
  if (quote.subtotalKurus < p.minSubtotalKurus) return `Bu kod ${formatTL(p.minSubtotalKurus)} ve üzeri siparişlerde geçerli`;
  return null;
}

export function promoDiscountKurus(p: Pick<Promo, "kind" | "value" | "maxDiscountKurus">, quote: Pick<PriceQuote, "lines">): number {
  const base = Math.max(0, discountableKurus(quote));
  const raw = p.kind === "yuzde" ? Math.round((base * p.value) / 100) : Math.round(p.value);
  const capped = p.kind === "yuzde" && p.maxDiscountKurus != null ? Math.min(raw, p.maxDiscountKurus) : raw;
  return Math.max(0, Math.min(capped, base));
}

export function applyPromo(quote: PriceQuote, label: string, amountKurus: number): PriceQuote {
  return applyCredit(quote, amountKurus, label, "promo").quote;
}

export const promoLabel = (p: Pick<Promo, "code" | "kind" | "value">) =>
  `Kampanya ${p.code} (${p.kind === "yuzde" ? `%${p.value.toLocaleString("tr-TR")}` : formatTL(p.value)})`;
