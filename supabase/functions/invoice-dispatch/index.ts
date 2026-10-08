// Bekleyen faturaları Paraşüt'e gönderir. notify-dispatch gibi zamanlanmış çağrılır
// ("x-notify-secret" başlığı ile; bkz. docs/kurulum.md).
import { createCtx } from "../_shared/context.ts";
import { handler } from "../_shared/http.ts";
import { handleInvoiceDispatch } from "../_shared/invoicing.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
Deno.serve(handler((req) => handleInvoiceDispatch(req, ctx, { env })));
