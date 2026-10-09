// Kurye hakedişi: teslim edilen siparişlerin kurye kazancını yazar. pg_cron ile 5 dakikada bir (docs/kurulum.md §6).
import { handleCourierEarnings } from "../_shared/courier-earnings.ts";
import { createCtx } from "../_shared/context.ts";
import { handler } from "../_shared/http.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
Deno.serve(handler((req) => handleCourierEarnings(req, ctx, { env })));
