// Tanıtım sitesi için herkese açık uç nokta (fiyat, adres arama, kurumsal başvuru). verify_jwt=false.
import { createCtx } from "../_shared/context.ts";
import { handler } from "../_shared/http.ts";
import { handleSite } from "../_shared/site.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
Deno.serve(handler((req) => handleSite(req, ctx, { env })));
