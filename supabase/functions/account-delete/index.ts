import { createCtx } from "../_shared/context.ts";
import { handleAccountDelete } from "../_shared/handlers.ts";
import { handler } from "../_shared/http.ts";

const ctx = createCtx();
Deno.serve(handler((req) => handleAccountDelete(req, ctx)));
