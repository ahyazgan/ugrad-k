// Postmark Inbound webhook → e-postayla sipariş asistanı.
// Webhook URL: https://<kullanıcı>:<EMAIL_INBOUND_SECRET>@<SUPABASE_URL host>/functions/v1/email-inbound
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { createCtx } from "../_shared/context.ts";
import { handleEmailInbound } from "../_shared/email-orders.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
const client = new Anthropic(); // ANTHROPIC_API_KEY ortam değişkeninden
// deno-lint-ignore no-explicit-any
const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil?.bind((globalThis as any).EdgeRuntime);

Deno.serve((req) => handleEmailInbound(req, { ctx, client, env, waitUntil }));
