import { createCtx } from "../_shared/context.ts";
import { handler } from "../_shared/http.ts";
import { handlePaymentRefund } from "../_shared/payments.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
Deno.serve(handler((req) => handlePaymentRefund(req, ctx, { env })));
