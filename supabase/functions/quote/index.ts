import { createCtx } from "../_shared/context.ts";
import { handleQuote } from "../_shared/handlers.ts";
import { handler } from "../_shared/http.ts";

const ctx = createCtx();
Deno.serve(handler((req) => handleQuote(req, ctx)));
