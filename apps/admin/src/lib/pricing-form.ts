import type { KmTier } from "@yazgan/shared";

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
