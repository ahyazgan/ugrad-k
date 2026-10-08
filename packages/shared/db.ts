import type { PricingSettings, CorporateTier, Holiday, KmTier } from "./pricing.ts";

/** `pricing_settings` tablosunun satırı (Supabase'den geldiği hâliyle). */
export interface PricingSettingsRow {
  base_fee_kurus: number;
  included_km: number;
  per_km_kurus: number;
  km_tiers: KmTier[];
  max_surcharge_pct: number | string | null;
  urgent_surcharge_pct: number | string;
  night_holiday_surcharge_pct: number | string;
  night_start_hour: number;
  night_end_hour: number;
  half_day_start_hour: number;
  waiting_free_minutes: number;
  waiting_block_minutes: number;
  waiting_block_fee_kurus: number;
  return_leg_discount_pct: number | string;
  heavy_threshold_kg: number | string;
  heavy_surcharge_kurus: number;
  bridge_fee_kurus: number;
  corporate_tiers: CorporateTier[];
  vat_pct: number | string;
  utc_offset_minutes: number;
}

/** PricingSettings alanı → veritabanı sütunu */
export const PRICING_COLUMN_MAP = {
  baseFeeKurus: "base_fee_kurus",
  includedKm: "included_km",
  perKmKurus: "per_km_kurus",
  kmTiers: "km_tiers",
  maxSurchargePct: "max_surcharge_pct",
  urgentSurchargePct: "urgent_surcharge_pct",
  nightHolidaySurchargePct: "night_holiday_surcharge_pct",
  nightStartHour: "night_start_hour",
  nightEndHour: "night_end_hour",
  halfDayStartHour: "half_day_start_hour",
  waitingFreeMinutes: "waiting_free_minutes",
  waitingBlockMinutes: "waiting_block_minutes",
  waitingBlockFeeKurus: "waiting_block_fee_kurus",
  returnLegDiscountPct: "return_leg_discount_pct",
  heavyThresholdKg: "heavy_threshold_kg",
  heavySurchargeKurus: "heavy_surcharge_kurus",
  bridgeFeeKurus: "bridge_fee_kurus",
  corporateTiers: "corporate_tiers",
  vatPct: "vat_pct",
  utcOffsetMinutes: "utc_offset_minutes",
} as const satisfies Record<keyof PricingSettings, keyof PricingSettingsRow>;

// Postgres numeric değerleri JSON'da metin olarak gelir.
const num = (v: number | string) => (typeof v === "number" ? v : Number(v));

export function pricingSettingsFromRow(row: PricingSettingsRow): PricingSettings {
  const out = {} as Record<string, unknown>;
  for (const [key, col] of Object.entries(PRICING_COLUMN_MAP)) {
    const v = row[col];
    if (col === "corporate_tiers" || col === "km_tiers") out[key] = v ?? [];
    else if (col === "max_surcharge_pct") out[key] = v == null ? null : num(v as number | string);
    else out[key] = num(v as number | string);
  }
  return out as unknown as PricingSettings;
}

export function pricingSettingsToRow(s: PricingSettings): PricingSettingsRow {
  const out = {} as Record<string, unknown>;
  for (const [key, col] of Object.entries(PRICING_COLUMN_MAP)) {
    out[col] = s[key as keyof PricingSettings];
  }
  return out as unknown as PricingSettingsRow;
}

export interface HolidayRow {
  date: string;
  name: string;
  half_day: boolean;
}

export const holidayFromRow = (r: HolidayRow): Holiday => ({ date: r.date, name: r.name, halfDay: r.half_day });
