import { createCtx } from "../_shared/context.ts";
import { handler } from "../_shared/http.ts";
import { handleInvoiceMonthly } from "../_shared/invoicing.ts";

const ctx = createCtx();
Deno.serve(handler((req) => handleInvoiceMonthly(req, ctx)));
