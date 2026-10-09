import { DEFAULT_PRICING_SETTINGS, pricingSettingsToRow } from "@yazgan/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bridgeRuleText, economyWindowText, tariffGroups } from "./pricing-info";
import { getPricingSettings, settingsFromRow } from "./pricing-settings";

// `server-only` throws outside a React Server bundle; the module itself is plain fetch logic.
vi.mock("server-only", () => ({}));

const liveRow = () => ({
  ...pricingSettingsToRow(DEFAULT_PRICING_SETTINGS),
  bridge_fee_kurus: 3_000,
  economy_cutoff_hour: 13,
  max_weight_kg: "15.00", // Postgres numeric arrives as text
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("settingsFromRow", () => {
  it("maps a pricing_settings row with the shared mapper", () => {
    const s = settingsFromRow(liveRow());
    expect(s.bridgeFeeKurus).toBe(3_000);
    expect(s.economyCutoffHour).toBe(13);
    expect(s.maxWeightKg).toBe(15);
  });

  it("keeps defaults for missing or malformed columns", () => {
    const row: Record<string, unknown> = { ...liveRow(), base_fee_kurus: "abc" };
    delete row.max_weight_kg;
    delete row.km_tiers;
    const s = settingsFromRow(row);
    expect(s.baseFeeKurus).toBe(DEFAULT_PRICING_SETTINGS.baseFeeKurus);
    expect(s.maxWeightKg).toBe(DEFAULT_PRICING_SETTINGS.maxWeightKg);
    expect(s.kmTiers).toEqual(DEFAULT_PRICING_SETTINGS.kmTiers);
    expect(s.bridgeFeeKurus).toBe(3_000);
  });

  it("allows null only for nullable limits", () => {
    const s = settingsFromRow({ ...liveRow(), max_surcharge_pct: null, base_fee_kurus: null as unknown as number });
    expect(s.maxSurchargePct).toBeNull();
    expect(s.baseFeeKurus).toBe(DEFAULT_PRICING_SETTINGS.baseFeeKurus);
  });
});

describe("getPricingSettings", () => {
  it("returns defaults without Supabase env (demo / env-less build) and does not fetch", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getPricingSettings()).toBe(DEFAULT_PRICING_SETTINGS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the live row over REST with ISR revalidation", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://demo.supabase.co/");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([liveRow()]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const s = await getPricingSettings();
    expect(s.bridgeFeeKurus).toBe(3_000);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { next?: { revalidate?: number } }];
    expect(url).toBe("https://demo.supabase.co/rest/v1/pricing_settings?select=*&id=eq.1&limit=1");
    expect(init.next?.revalidate).toBe(3600);
    expect((init.headers as Record<string, string>).apikey).toBe("anon");
  });

  it("falls back to defaults on HTTP errors, empty tables and network failures", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://demo.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const impl of [
      async () => new Response("nope", { status: 500 }),
      async () => new Response("[]", { status: 200 }),
      async () => {
        throw new TypeError("fetch failed");
      },
    ]) {
      vi.stubGlobal("fetch", vi.fn(impl));
      expect(await getPricingSettings()).toBe(DEFAULT_PRICING_SETTINGS);
    }
  });
});

describe("site copy follows the tariff", () => {
  const s = settingsFromRow(liveRow());

  it("bridge rule: either address on the European side, once per order", () => {
    expect(bridgeRuleText(s)).toBe("Alış veya teslim adresi Avrupa yakasındaysa siparişe bir kez köprü geçiş ücreti (+30 TL) eklenir.");
    expect(JSON.stringify(tariffGroups(s))).not.toMatch(/Anadolu yakasından Avrupa|yönü ücretli/);
  });

  it("economy window uses night end and cutoff hours", () => {
    expect(economyWindowText(s)).toBe("Pazartesi–Cumartesi 07:00–13:00");
    expect(tariffGroups(s).base.rows.at(-1)?.label).toContain("Pzt–Cmt 07:00–13:00");
  });

  it("limits come from the settings", () => {
    const labels = tariffGroups(s).limits.rows.map((r) => r.value);
    expect(labels).toContain("15 kg");
  });
});
