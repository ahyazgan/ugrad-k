import type { CostModel } from "./cost.ts";
import type { PricingSettings, CorporateTier, Holiday, KmTier } from "./pricing.ts";

/** `pricing_settings` tablosunun satırı (Supabase'den geldiği hâliyle). */
export interface PricingSettingsRow {
  base_fee_kurus: number;
  included_km: number;
  per_km_kurus: number;
  km_tiers: KmTier[];
  max_surcharge_pct: number | string | null;
  urgent_surcharge_pct: number | string;
  economy_discount_pct: number | string;
  economy_cutoff_hour: number;
  night_surcharge_pct: number | string;
  sunday_surcharge_pct: number | string;
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
  max_weight_kg: number | string | null;
  bridge_fee_kurus: number;
  service_center_lat: number | string;
  service_center_lng: number | string;
  free_pickup_radius_km: number | string;
  remote_pickup_per_km_kurus: number;
  remote_pickup_max_kurus: number;
  free_coverage_kurus: number;
  insurance_rate_pct: number | string;
  insurance_min_kurus: number;
  max_declared_value_kurus: number | null;
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
  economyDiscountPct: "economy_discount_pct",
  economyCutoffHour: "economy_cutoff_hour",
  nightSurchargePct: "night_surcharge_pct",
  sundaySurchargePct: "sunday_surcharge_pct",
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
  maxWeightKg: "max_weight_kg",
  bridgeFeeKurus: "bridge_fee_kurus",
  serviceCenterLat: "service_center_lat",
  serviceCenterLng: "service_center_lng",
  freePickupRadiusKm: "free_pickup_radius_km",
  remotePickupPerKmKurus: "remote_pickup_per_km_kurus",
  remotePickupMaxKurus: "remote_pickup_max_kurus",
  freeCoverageKurus: "free_coverage_kurus",
  insuranceRatePct: "insurance_rate_pct",
  insuranceMinKurus: "insurance_min_kurus",
  maxDeclaredValueKurus: "max_declared_value_kurus",
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
    else if (col === "max_surcharge_pct" || col === "max_weight_kg" || col === "max_declared_value_kurus") out[key] = v == null ? null : num(v as number | string);
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

/** `cost_settings` (kurye ödeme modeli ve genel gider) sütunları */
export const COST_COLUMN_MAP = {
  courierPerJobKurus: "courier_per_job_kurus",
  courierPerKmKurus: "courier_per_km_kurus",
  urgentBonusPct: "urgent_bonus_pct",
  offHoursBonusPct: "off_hours_bonus_pct",
  economyJobPayPct: "economy_job_pay_pct",
  waitingSharePct: "waiting_share_pct",
  overheadPerJobKurus: "overhead_per_job_kurus",
  cardFeePct: "card_fee_pct",
} as const satisfies Record<keyof CostModel, string>;

export type CostSettingsRow = Record<(typeof COST_COLUMN_MAP)[keyof CostModel], number | string>;

export function costModelFromRow(row: CostSettingsRow): CostModel {
  const out = {} as Record<string, number>;
  for (const [key, col] of Object.entries(COST_COLUMN_MAP)) out[key] = num(row[col]);
  return out as unknown as CostModel;
}

export function costModelToRow(m: CostModel): CostSettingsRow {
  const out = {} as Record<string, number>;
  for (const [key, col] of Object.entries(COST_COLUMN_MAP)) out[col] = m[key as keyof CostModel];
  return out as CostSettingsRow;
}

export interface HolidayRow {
  date: string;
  name: string;
  half_day: boolean;
}

export const holidayFromRow = (r: HolidayRow): Holiday => ({ date: r.date, name: r.name, halfDay: r.half_day });
