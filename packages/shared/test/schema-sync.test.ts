import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ORDER_STATUSES, ORDER_TRANSITIONS } from "../orders.ts";
import { DEFAULT_PRICING_SETTINGS } from "../pricing.ts";
import { COURIER_DOCUMENT_TYPES } from "../compliance.ts";
import { DEFAULT_COST_MODEL } from "../cost.ts";
import { COST_COLUMN_MAP, costModelFromRow, costModelToRow, PRICING_COLUMN_MAP, pricingSettingsFromRow, pricingSettingsToRow } from "../db.ts";

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

  it("cost_settings sütunları CostModel ile eşleşir, varsayılanlar aynı", () => {
    const table = sql.split("create table public.cost_settings (")[1]?.split(");")[0] ?? "";
    for (const [key, col] of Object.entries(COST_COLUMN_MAP)) {
      const m = table.match(new RegExp(`\\n\\s+${col}\\s[^\\n]*default ([0-9.]+)`));
      expect(m, col).not.toBeNull();
      expect(Number(m![1]), col).toBe(DEFAULT_COST_MODEL[key as keyof typeof DEFAULT_COST_MODEL]);
    }
    expect(costModelFromRow({ ...costModelToRow(DEFAULT_COST_MODEL), card_fee_pct: "2.50" })).toEqual(DEFAULT_COST_MODEL);
  });

  it("courier_document_types satırları COURIER_DOCUMENT_TYPES ile aynı", () => {
    const block = sql.split("insert into public.courier_document_types")[1]?.split(";")[0] ?? "";
    const rows = [...block.matchAll(/\('([a-z_]+)', '([^']+)', (true|false), (true|false), \d+\)/g)].map((m) => ({
      kind: m[1],
      label: m[2],
      required: m[3] === "true",
      expires: m[4] === "true",
    }));
    expect(rows).toEqual(COURIER_DOCUMENT_TYPES);
  });

  it("satır ↔ ayar dönüşümü kayıpsız, numeric metinleri sayıya çevirir", () => {
    const row = pricingSettingsToRow(DEFAULT_PRICING_SETTINGS);
    expect(pricingSettingsFromRow(row)).toEqual(DEFAULT_PRICING_SETTINGS);
    expect(pricingSettingsFromRow({ ...row, vat_pct: "20.00" }).vatPct).toBe(20);
  });
});
