import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ORDER_STATUSES, ORDER_TRANSITIONS } from "../orders.ts";
import { DEFAULT_PRICING_SETTINGS } from "../pricing.ts";
import { PRICING_COLUMN_MAP, pricingSettingsFromRow, pricingSettingsToRow } from "../db.ts";

// TypeScript ile SQL migration'larının birbirinden kopmadığını doğrular.
const migrationsDir = join(import.meta.dirname, "../../../supabase/migrations");
const sql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

describe("şema senkronu", () => {
  it("order_status enum'u aynı", () => {
    const m = sql.match(/create type public\.order_status as enum \(([^)]*)\)/);
    const values = [...(m?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(values).toEqual([...ORDER_STATUSES]);
  });

  it("izinli geçişler aynı", () => {
    const block = sql.split("insert into public.order_status_transitions")[1]?.split(";")[0] ?? "";
    const pairs = [...block.matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map((x) => `${x[1]}>${x[2]}`).sort();
    const expected = Object.entries(ORDER_TRANSITIONS)
      .flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`))
      .sort();
    expect(pairs).toEqual(expected);
  });

  it("pricing_settings sütunları PricingSettings ile eşleşir", () => {
    const table = sql.split("create table public.pricing_settings (")[1]?.split(");")[0] ?? "";
    const altered = [...sql.matchAll(/alter table public\.pricing_settings([\s\S]*?);/g)].map((m) => m[1]).join("\n");
    for (const col of Object.values(PRICING_COLUMN_MAP)) {
      const inCreate = new RegExp(`\\n\\s+${col}\\s`).test(table);
      const inAlter = new RegExp(`add column ${col}\\s`).test(altered);
      expect(inCreate || inAlter, col).toBe(true);
    }
  });

  it("satır ↔ ayar dönüşümü kayıpsız, numeric metinleri sayıya çevirir", () => {
    const row = pricingSettingsToRow(DEFAULT_PRICING_SETTINGS);
    expect(pricingSettingsFromRow(row)).toEqual(DEFAULT_PRICING_SETTINGS);
    expect(pricingSettingsFromRow({ ...row, vat_pct: "20.00" }).vatPct).toBe(20);
  });
});
