// Geri kazanma mesajı (günlük cron, docs/kurulum.md §6, §27).
import { createCtx } from "../_shared/context.ts";
import { handler } from "../_shared/http.ts";
import { handleWinback } from "../_shared/winback.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
Deno.serve(handler((req) => handleWinback(req, ctx, { env })));
