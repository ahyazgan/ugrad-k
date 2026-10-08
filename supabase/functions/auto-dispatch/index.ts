// Otomatik onay + kurye atama. pg_cron ile dakikada bir (docs/kurulum.md §6) veya panelden.
import { handleAutoDispatch } from "../_shared/auto-dispatch.ts";
import { createCtx } from "../_shared/context.ts";
import { handler } from "../_shared/http.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
Deno.serve(handler((req) => handleAutoDispatch(req, ctx, { env })));
