import { createCtx } from "../_shared/context.ts";
import { handler } from "../_shared/http.ts";
import { handlePaymentInit } from "../_shared/payments.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
Deno.serve(handler((req) => handlePaymentInit(req, ctx, { env })));
