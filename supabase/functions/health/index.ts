// Sistem sağlığı: GET → kesinti izleyicisi (ayrıntısız), POST + x-notify-secret → 5 dakikalık denetim ve uyarı
import { createCtx } from "../_shared/context.ts";
import { handleHealth } from "../_shared/health.ts";
import { handler } from "../_shared/http.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
Deno.serve(handler((req) => handleHealth(req, ctx, { env })));
