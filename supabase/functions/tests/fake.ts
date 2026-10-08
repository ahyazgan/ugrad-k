// Testler için sahte Supabase istemcisi: yalnızca handler'ların kullandığı zincirleri taklit eder.
import { DEFAULT_PRICING_SETTINGS, mockMapsProvider } from "../../../packages/shared/index.ts";
import type { Ctx } from "../_shared/context.ts";
import { HttpError } from "../_shared/http.ts";

type Row = Record<string, unknown>;

export function fakeDb(tables: Record<string, Row[]>) {
  const inserted: Record<string, Row[]> = {};
  const updated: Record<string, Row[]> = {};
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let insertRow: Row | null = null;
    let updatePatch: Row | null = null;
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => {
        rows = rows.filter((r) => r[col] === v);
        if (updatePatch) {
          for (const r of rows) Object.assign(r, updatePatch);
          (updated[table] ??= []).push(...rows);
          return Promise.resolve({ data: null, error: null });
        }
        return q;
      },
      update: (patch: Row) => {
        updatePatch = patch;
        return q;
      },
      gte: () => q,
      limit: () => q,
      insert: (row: Row) => {
        insertRow = { id: "new-id", order_no: "YK-1000", status: "beklemede", tracking_token: "t".repeat(32), ...row };
        (inserted[table] ??= []).push(insertRow);
        return q;
      },
      single: () =>
        Promise.resolve(
          insertRow
            ? { data: insertRow, error: null }
            : rows[0]
              ? { data: rows[0], error: null }
              : { data: null, error: { message: "not found" } },
        ),
      then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
    };
    return q;
  };
  const rpc = (name: string) => Promise.resolve({ data: tables[`rpc:${name}`] ?? [], error: null });
  return { client: { from, rpc } as unknown as Ctx["admin"], inserted, updated };
}

export function fakeCtx(opts: { userId?: string | null; tables?: Record<string, Row[]> } = {}) {
  const db = fakeDb(opts.tables ?? {});
  const ctx: Ctx = {
    maps: mockMapsProvider(),
    admin: db.client,
    getUser: () =>
      opts.userId === null
        ? Promise.reject(new HttpError(401, "Giriş yapmanız gerekiyor"))
        : Promise.resolve({ id: opts.userId ?? "u1" }),
    loadPricing: () => Promise.resolve({ settings: DEFAULT_PRICING_SETTINGS, holidays: [] }),
  };
  return { ctx, inserted: db.inserted, updated: db.updated };
}
