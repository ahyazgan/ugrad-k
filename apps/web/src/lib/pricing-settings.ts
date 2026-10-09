import "server-only";

import {
  DEFAULT_PRICING_SETTINGS,
  PRICING_COLUMN_MAP,
  pricingSettingsFromRow,
  type PricingSettings,
  type PricingSettingsRow,
} from "@yazgan/shared";

/** How long a fetched tariff is reused before Next.js refetches it (ISR, seconds). */
export const PRICING_REVALIDATE_SECONDS = 3600;

const NULLABLE = new Set<keyof PricingSettings>(["maxSurchargePct", "maxWeightKg", "maxDeclaredValueKurus"]);
const ARRAYS = new Set<keyof PricingSettings>(["kmTiers", "corporateTiers"]);

/**
 * Maps a `pricing_settings` row (PostgREST JSON) to PricingSettings with the shared mapper, then
 * falls back to the default for every column that is missing or malformed (e.g. a migration not yet
 * applied), so one bad column never blanks the whole tariff.
 */
export function settingsFromRow(row: Partial<PricingSettingsRow> | null | undefined): PricingSettings {
  if (!row || typeof row !== "object") return DEFAULT_PRICING_SETTINGS;
  const mapped = pricingSettingsFromRow(row as PricingSettingsRow) as unknown as Record<string, unknown>;
  const out = { ...DEFAULT_PRICING_SETTINGS } as unknown as Record<string, unknown>;
  for (const [key, col] of Object.entries(PRICING_COLUMN_MAP) as Array<[keyof PricingSettings, keyof PricingSettingsRow]>) {
    if (!(col in row)) continue;
    // Number(null) is 0: a null in a NOT NULL column must not silently become a free fee.
    if (row[col] == null && !NULLABLE.has(key)) continue;
    const v = mapped[key];
    const ok = ARRAYS.has(key) ? Array.isArray(v) : v === null ? NULLABLE.has(key) : typeof v === "number" && Number.isFinite(v);
    if (ok) out[key] = v;
  }
  return out as unknown as PricingSettings;
}

/**
 * Live tariff for server components. `pricing_settings` is world-readable (RLS `select using (true)`),
 * so the public anon key is enough. Without Supabase env (demo, env-less build) or on any error the
 * site renders with DEFAULT_PRICING_SETTINGS from packages/shared/pricing.ts.
 */
export async function getPricingSettings(): Promise<PricingSettings> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return DEFAULT_PRICING_SETTINGS;
  try {
    const res = await fetch(`${url}/rest/v1/pricing_settings?select=*&id=eq.1&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: "application/json" },
      next: { revalidate: PRICING_REVALIDATE_SECONDS, tags: ["pricing-settings"] },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()) as Array<Partial<PricingSettingsRow>>;
    if (!Array.isArray(rows) || !rows[0]) throw new Error("empty pricing_settings");
    return settingsFromRow(rows[0]);
  } catch (e) {
    console.warn("[pricing-settings] using defaults:", e instanceof Error ? e.message : e);
    return DEFAULT_PRICING_SETTINGS;
  }
}
