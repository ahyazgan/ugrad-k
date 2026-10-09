// Canlıya hazırlık denetimi (panel → Otomasyon). Yalnız yönetici JWT'si.
import { createCtx } from "../_shared/context.ts";
import { handler } from "../_shared/http.ts";
import { handleReadiness } from "../_shared/readiness.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
Deno.serve(handler((req) => handleReadiness(req, ctx, { env })));
