// Kurumsal webhook kuyruğunu işler (dakikalık cron, x-notify-secret)
import { createCtx } from "../_shared/context.ts";
import { handler } from "../_shared/http.ts";
import { handleWebhookDispatch } from "../_shared/webhooks.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
Deno.serve(handler((req) => handleWebhookDispatch(req, ctx, { env })));
