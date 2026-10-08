import { createCtx } from "../_shared/context.ts";
import { handleRepriceOrder } from "../_shared/handlers.ts";
import { handler } from "../_shared/http.ts";

const ctx = createCtx();
Deno.serve(handler((req) => handleRepriceOrder(req, ctx)));
