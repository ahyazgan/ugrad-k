// Acil durum (SOS): kurye JWT'si; alarm kaydedilir, yöneticilere hemen WhatsApp/SMS gider.
import { createCtx } from "../_shared/context.ts";
import { handler } from "../_shared/http.ts";
import { handleSos } from "../_shared/sos.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
Deno.serve(handler((req) => handleSos(req, ctx, { env })));
