// Bildirim kuyruğunu işler. Tetikleme (ikisinden biri):
//  • Supabase Database Webhook: notifications tablosuna INSERT/UPDATE → bu fonksiyon
//  • pg_cron + pg_net ile dakikada bir (docs/kurulum.md)
// İstekte "x-notify-secret: <NOTIFY_SECRET>" başlığı olmalıdır.
import { createCtx } from "../_shared/context.ts";
import { handleNotifyDispatch } from "../_shared/dispatch.ts";
import { handler } from "../_shared/http.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
Deno.serve(handler((req) => handleNotifyDispatch(req, ctx, { env })));
