import { createCtx } from "../_shared/context.ts";
import { handlePlaces } from "../_shared/handlers.ts";
import { handler } from "../_shared/http.ts";

const ctx = createCtx();
Deno.serve(handler((req) => handlePlaces(req, ctx)));
