import type { CorporateTier, KmTier } from "@yazgan/shared";

/** Kademeleri "10:25, *:18" metnine çevirir (TL). */
export function formatKmTiers(tiers: KmTier[]): string {
  // Ondalık ayırıcı nokta (virgül kademe ayırıcısıdır)
  return tiers.map((t) => `${t.uptoKm ?? "*"}:${t.perKmKurus / 100}`).join(", ");
}

/**
 * "10:25, *:18" → [{uptoKm:10, perKmKurus:2500}, {uptoKm:null, perKmKurus:1800}]. Ondalık: "22.5".
 * Boş metin → [] (sabit km ücreti). Geçersizse null.
 */
export function parseKmTiers(text: string): KmTier[] | null {
  const items = text.split(",").map((x) => x.trim()).filter(Boolean);
  const out: KmTier[] = [];
  for (const it of items) {
    const [a, b, ...rest] = it.split(":").map((x) => x.trim());
    if (rest.length || a == null || b == null) return null;
    const upto = a === "*" || a === "" ? null : Number(a);
    const tl = Number(b);
    if (upto !== null && (!Number.isInteger(upto) || upto <= 0)) return null;
    if (!Number.isFinite(tl) || tl < 0) return null;
    out.push({ uptoKm: upto, perKmKurus: Math.round(tl * 100) });
  }
  if (out.filter((t) => t.uptoKm === null).length > 1) return null;
  const limits = out.map((t) => t.uptoKm).filter((x): x is number => x !== null);
  if (new Set(limits).size !== limits.length) return null;
  return out;
}

/** Tavan alanı: boş → null (tavan yok), sayı → yüzde, geçersiz → undefined */
export function parseCap(text: string): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Whole TL without trailing ",00" ("25", "22,5") for compact rule texts */
const tlShort = (kurus: number) => (kurus / 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 });

/** "10 km'ye kadar 25 TL/km, üstü 18 TL/km" — plain-language reading of km tiers */
export function describeKmTiers(tiers: KmTier[]): string {
  const sorted = [...tiers].sort((a, b) => (a.uptoKm ?? Infinity) - (b.uptoKm ?? Infinity));
  return sorted
    .map((t) => (t.uptoKm == null ? `üstü ${tlShort(t.perKmKurus)} TL/km` : `${t.uptoKm} km'ye kadar ${tlShort(t.perKmKurus)} TL/km`))
    .join(", ");
}

/** Corporate tiers ↔ "20:15, 50:25" (deliveries per month : discount %) */
export function formatCorporateTiers(tiers: CorporateTier[]): string {
  return tiers.map((t) => `${t.minDeliveries}:${t.discountPct}`).join(", ");
}

/** "20:15, 50:25" → tiers; empty text → []; invalid → null */
export function parseCorporateTiers(text: string): CorporateTier[] | null {
  const parsed = text
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    // Boş parça ("20:") Number("") = 0 olarak geçmesin
    .map((x) => x.split(":").map((n) => (n.trim() === "" ? NaN : Number(n.trim()))));
  if (parsed.some((p) => p.length !== 2 || p.some((n) => !Number.isFinite(n) || n < 0))) return null;
  return parsed.map(([minDeliveries, discountPct]) => ({ minDeliveries: minDeliveries!, discountPct: discountPct! }));
}

/** "ayda 20+ teslimatta %15, 50+ teslimatta %25" */
export function describeCorporateTiers(tiers: CorporateTier[]): string {
  const sorted = [...tiers].sort((a, b) => a.minDeliveries - b.minDeliveries);
  return `ayda ${sorted.map((t) => `${t.minDeliveries}+ teslimatta %${t.discountPct.toLocaleString("tr-TR")}`).join(", ")}`;
}
