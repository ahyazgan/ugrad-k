import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { createCtx } from "../_shared/context.ts";
import { handleVoiceTurn } from "../_shared/whatsapp-webhook.ts";

const ctx = createCtx();
const env = (k: string) => Deno.env.get(k);
const client = new Anthropic();

Deno.serve((req) => handleVoiceTurn(req, { ctx, client, env }));
