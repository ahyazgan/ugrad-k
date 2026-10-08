import { createCtx } from "../_shared/context.ts";
import { handleCreateOrder } from "../_shared/handlers.ts";
import { handler } from "../_shared/http.ts";

const ctx = createCtx();
Deno.serve(handler((req) => handleCreateOrder(req, ctx)));
