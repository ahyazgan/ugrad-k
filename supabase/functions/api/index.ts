// Kurumsal REST API: /functions/v1/api/v1/... (verify_jwt=false; kimlik API anahtarıyla)
import { createCtx } from "../_shared/context.ts";
import { handleCorporateApi } from "../_shared/corporate-api.ts";
import { handler } from "../_shared/http.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
Deno.serve(handler((req) => handleCorporateApi(req, ctx, { env })));
