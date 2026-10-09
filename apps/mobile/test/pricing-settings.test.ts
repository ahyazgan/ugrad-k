import { DEFAULT_PRICING_SETTINGS, type PricingSettings } from "@yazgan/shared";
import { describe, expect, it } from "vitest";
import { corporateTiersText, createPricingSettingsCache } from "../src/lib/pricing-settings-core";

describe("createPricingSettingsCache", () => {
  it("fetches once and shares the in-flight request", async () => {
    let calls = 0;
    const live: PricingSettings = { ...DEFAULT_PRICING_SETTINGS, bridgeFeeKurus: 3_000 };
    const cache = createPricingSettingsCache(async () => {
      calls++;
      return live;
    });
    expect(cache.current()).toBeNull();
    const [a, b] = await Promise.all([cache.load(), cache.load()]);
    expect(a).toBe(live);
    expect(b).toBe(live);
    expect(await cache.load()).toBe(live);
    expect(cache.current()).toBe(live);
    expect(calls).toBe(1);
  });

  it("retries after a failed load", async () => {
    let calls = 0;
    const cache = createPricingSettingsCache(async () => {
      calls++;
      if (calls === 1) throw new Error("offline");
      return DEFAULT_PRICING_SETTINGS;
    });
    await expect(cache.load()).rejects.toThrow("offline");
    expect(cache.current()).toBeNull();
    expect(await cache.load()).toBe(DEFAULT_PRICING_SETTINGS);
    expect(calls).toBe(2);
  });
});

describe("corporateTiersText", () => {
  it("lists tiers in ascending order", () => {
    const text = corporateTiersText({
      corporateTiers: [
        { minDeliveries: 50, discountPct: 25 },
        { minDeliveries: 20, discountPct: 15 },
      ],
    });
    expect(text).toBe("Ayda 20+ teslimatta %15, 50+ teslimatta %25");
  });

  it("follows live values and hides empty tiers", () => {
    expect(corporateTiersText({ corporateTiers: [{ minDeliveries: 30, discountPct: 12.5 }] })).toBe("Ayda 30+ teslimatta %12,5");
    expect(corporateTiersText({ corporateTiers: [] })).toBeNull();
    expect(corporateTiersText({ corporateTiers: [{ minDeliveries: 10, discountPct: 0 }] })).toBeNull();
  });
});
