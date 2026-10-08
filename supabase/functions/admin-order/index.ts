import { handleAdminOrder } from "../_shared/admin-order.ts";
import { createCtx } from "../_shared/context.ts";
import { handler } from "../_shared/http.ts";

const ctx = createCtx();
Deno.serve(handler((req) => handleAdminOrder(req, ctx)));
