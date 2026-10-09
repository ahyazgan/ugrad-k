// Pure helpers behind usePricingSettings (no React Native imports, unit-tested in test/pricing-settings.test.ts)
import type { PricingSettings } from "@yazgan/shared";

export interface PricingSettingsCache {
  /** Last successfully loaded settings (null until the first load succeeds) */
  current(): PricingSettings | null;
  /** Loads once and shares the in-flight request; after a failure the next call retries */
  load(): Promise<PricingSettings>;
}

export function createPricingSettingsCache(fetchSettings: () => Promise<PricingSettings>): PricingSettingsCache {
  let cached: PricingSettings | null = null;
  let inflight: Promise<PricingSettings> | null = null;
  return {
    current: () => cached,
    load() {
      if (cached) return Promise.resolve(cached);
      if (!inflight) {
        inflight = fetchSettings().then(
          (s) => {
            cached = s;
            return s;
          },
          (e: unknown) => {
            inflight = null;
            throw e;
          },
        );
      }
      return inflight;
    },
  };
}

/** "Ayda 20+ teslimatta %15, 50+ teslimatta %25" — corporate volume tiers in ascending order; null if none */
export function corporateTiersText(s: Pick<PricingSettings, "corporateTiers">): string | null {
  const tiers = s.corporateTiers.filter((t) => t.discountPct > 0).sort((a, b) => a.minDeliveries - b.minDeliveries);
  if (!tiers.length) return null;
  return `Ayda ${tiers.map((t) => `${t.minDeliveries}+ teslimatta %${t.discountPct.toLocaleString("tr-TR")}`).join(", ")}`;
}
