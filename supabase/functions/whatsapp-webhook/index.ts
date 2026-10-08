// Meta → WhatsApp Business webhook (Callback URL: <SUPABASE_URL>/functions/v1/whatsapp-webhook)
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { createCtx } from "../_shared/context.ts";
import { handleWhatsAppWebhook } from "../_shared/whatsapp-webhook.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
const client = new Anthropic(); // ANTHROPIC_API_KEY ortam değişkeninden
// deno-lint-ignore no-explicit-any
const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil?.bind((globalThis as any).EdgeRuntime);

Deno.serve((req) => handleWhatsAppWebhook(req, { ctx, client, env, waitUntil }));
