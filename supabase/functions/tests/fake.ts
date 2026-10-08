// Testler için sahte Supabase istemcisi: yalnızca handler'ların kullandığı zincirleri taklit eder.
import { DEFAULT_PRICING_SETTINGS, mockMapsProvider } from "../../../packages/shared/index.ts";
import type { Ctx } from "../_shared/context.ts";
import { HttpError } from "../_shared/http.ts";

type Row = Record<string, unknown>;

// deno-lint-ignore no-explicit-any
export function fakeDb(tables: Record<string, any>) {
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
      ilike: (col: string, pattern: string) => {
        const want = pattern.replace(/\\(.)/g, "$1").toLowerCase();
        rows = rows.filter((r) => String(r[col] ?? "").toLowerCase() === want);
        return q;
      },
      is: (col: string, v: unknown) => {
        rows = rows.filter((r) => (r[col] ?? null) === v);
        return q;
      },
      gte: () => q,
      lt: () => q,
      limit: () => q,
      insert: (row: Row | Row[]) => {
        const rowsIn = Array.isArray(row) ? row : [row];
        // assistant_inbound: message_id benzersiz
        if (table === "assistant_inbound" && rowsIn.some((r) => (inserted[table] ?? []).some((x) => x.message_id === r.message_id))) {
          const err = { data: null, error: { code: "23505", message: "duplicate" } };
          return { ...q, then: (resolve: (v: unknown) => void) => resolve(err) };
        }
        for (const r of rowsIn) {
          insertRow = { id: "new-id", order_no: "YK-1000", status: "beklemede", tracking_token: "t".repeat(32), messages: [], ...r };
          (inserted[table] ??= []).push(insertRow);
          (tables[table] ??= []).push(insertRow);
        }
        return q;
      },
      in: (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return q;
      },
      order: () => q,
      maybeSingle: () => Promise.resolve({ data: insertRow ?? rows[0] ?? null, error: null }),
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
  const rpcCalls: Array<{ name: string; args: Row }> = [];
  const rpc = (name: string, args: Row = {}) => {
    rpcCalls.push({ name, args });
    const v = tables[`rpc:${name}`];
    return Promise.resolve({ data: typeof v === "function" ? (v as (a: Row) => unknown)(args) : (v ?? []), error: null });
  };
  return { client: { from, rpc } as unknown as Ctx["admin"], inserted, updated, rpcCalls };
}

// deno-lint-ignore no-explicit-any
export function fakeCtx(opts: { userId?: string | null; tables?: Record<string, any> } = {}) {
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
  return { ctx, inserted: db.inserted, updated: db.updated, rpcCalls: db.rpcCalls };
}
