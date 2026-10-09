// Kampanya ve davet kodlarının sunucuda doğrulanması (fiyat satırı "promo"). Kurallar packages/shared/promo.ts.
import {
  applyPromo,
  formatTL,
  normalizeCode,
  promoDiscountKurus,
  promoLabel,
  promoProblem,
  type PriceQuote,
  type Promo,
} from "../../../packages/shared/index.ts";
import type { Ctx } from "./context.ts";
import { HttpError } from "./http.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export type Redemption =
  | { kind: "kampanya"; code: string; amountKurus: number }
  | { kind: "davet"; code: string; amountKurus: number; referrerId: string };

export const promoFromRow = (r: Row): Promo => ({
  code: r.code,
  description: r.description ?? null,
  kind: r.kind,
  value: Number(r.value),
  maxDiscountKurus: r.max_discount_kurus ?? null,
  minSubtotalKurus: r.min_subtotal_kurus ?? 0,
  validFrom: r.valid_from ?? null,
  validUntil: r.valid_until ?? null,
  maxRedemptions: r.max_redemptions ?? null,
  perCustomerLimit: r.per_customer_limit ?? 1,
  newCustomersOnly: !!r.new_customers_only,
  customerId: r.customer_id ?? null,
  active: !!r.active,
});

const bad = (msg: string) => new HttpError(400, msg, "promoCode");

/** Kodu doğrular ve teklife uygular; geçersizse 400 (alan: promoCode) */
export async function applyDiscountCode(
  ctx: Ctx,
  customerId: string,
  rawCode: string | undefined,
  quote: PriceQuote,
  now: Date = new Date(),
): Promise<{ quote: PriceQuote; redemption: Redemption | null }> {
  if (!rawCode) return { quote, redemption: null };
  const code = normalizeCode(rawCode);
  const { data: myOrders } = await ctx.admin.from("orders").select("id, status").eq("customer_id", customerId);
  const orderCount = ((myOrders ?? []) as Row[]).filter((o) => o.status !== "iptal").length;

  const { data: promoRow } = await ctx.admin.from("promo_codes").select("*").eq("code", code).maybeSingle();
  if (promoRow) {
    const promo = promoFromRow(promoRow as Row);
    const { data: uses } = await ctx.admin.from("promo_redemptions").select("customer_id").eq("code", code);
    const list = (uses ?? []) as Row[];
    const problem = promoProblem(promo, quote, {
      now,
      customerId,
      customerOrderCount: orderCount,
      customerRedemptions: list.filter((u) => u.customer_id === customerId).length,
      totalRedemptions: list.length,
    });
    if (problem) throw bad(problem);
    const amount = promoDiscountKurus(promo, quote);
    if (amount <= 0) throw bad("Bu kod bu siparişe indirim sağlamıyor");
    return { quote: applyPromo(quote, promoLabel(promo), amount), redemption: { kind: "kampanya", code, amountKurus: amount } };
  }

  // Davet kodu: yalnız ilk siparişte, kendi kodu olamaz
  const { data: referrer } = await ctx.admin.from("profiles").select("id").eq("referral_code", code).maybeSingle();
  if (!referrer) throw bad("Kod bulunamadı");
  if ((referrer as Row).id === customerId) throw bad("Kendi davet kodunuzu kullanamazsınız");
  if (orderCount > 0) throw bad("Davet kodu yalnız ilk siparişte geçerli");
  const { data: ops } = await ctx.admin.from("ops_settings").select("referral_reward_kurus").eq("id", 1).single();
  const reward = Number((ops as Row | null)?.referral_reward_kurus ?? 0);
  if (reward <= 0) throw bad("Davet indirimi şu an kapalı");
  const amount = promoDiscountKurus({ kind: "tutar", value: reward, maxDiscountKurus: null }, quote);
  return {
    quote: applyPromo(quote, `Davet indirimi (${formatTL(reward)})`, amount),
    redemption: { kind: "davet", code, amountKurus: amount, referrerId: (referrer as Row).id },
  };
}

export async function recordRedemption(ctx: Ctx, customerId: string, orderId: string, r: Redemption | null) {
  if (!r) return;
  await ctx.admin
    .from("promo_redemptions")
    .insert({ code: r.code, kind: r.kind, customer_id: customerId, order_id: orderId, amount_kurus: r.amountKurus });
  if (r.kind === "davet") {
    await ctx.admin.from("profiles").update({ referred_by: r.referrerId }).is("referred_by", null).eq("id", customerId);
  }
}
