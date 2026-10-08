// Müşteri kredisi (acil taahhüt gecikmesi telafisi): sonraki siparişin teklifine eksi satır olarak eklenir.
import { applyCredit, formatTL, type PriceQuote } from "../../../packages/shared/index.ts";
import type { Ctx } from "./context.ts";

export interface OpenCredit {
  id: string;
  amount_kurus: number;
  reason: string;
}

export async function openCredits(ctx: Ctx, customerId: string): Promise<OpenCredit[]> {
  const { data } = await ctx.admin
    .from("customer_credits")
    .select("id, amount_kurus, reason")
    .eq("customer_id", customerId)
    .is("used_order_id", null)
    .order("created_at");
  return (data ?? []) as OpenCredit[];
}

/** Ara toplama sığan kredileri sırayla uygular (kısmi kullanım yok: sığmayan sonraki siparişe kalır) */
export function withCredits(quote: PriceQuote, credits: OpenCredit[]): { quote: PriceQuote; used: OpenCredit[] } {
  let q = quote;
  const used: OpenCredit[] = [];
  for (const c of credits) {
    if (c.amount_kurus > q.subtotalKurus) continue;
    q = applyCredit(q, c.amount_kurus, `Telafi: ${c.reason} (−${formatTL(c.amount_kurus)})`).quote;
    used.push(c);
  }
  return { quote: q, used };
}

export async function markCreditsUsed(ctx: Ctx, used: OpenCredit[], orderId: string) {
  if (!used.length) return;
  await ctx.admin
    .from("customer_credits")
    .update({ used_order_id: orderId, used_at: new Date().toISOString() })
    .in("id", used.map((c) => c.id))
    .is("used_order_id", null);
}
