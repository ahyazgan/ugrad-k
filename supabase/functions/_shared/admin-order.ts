// Panelden telefon siparişi: müşteriyi bul/oluştur, sözlü KVKK onayını kaydet, siparişi oluştur.
import { KVKK_VERSION, parseOrderRequest } from "../../../packages/shared/index.ts";
import type { Ctx } from "./context.ts";
import { findCustomerByPhone, findOrCreateCustomerDefault, hasOrderConsent } from "./customers.ts";
import { createOrderForCustomer } from "./handlers.ts";
import { HttpError, json, readJson } from "./http.ts";

async function requireAdmin(req: Request, ctx: Ctx) {
  const user = await ctx.getUser(req);
  const { data } = await ctx.admin.from("profiles").select("role").eq("id", user.id).single();
  if (data?.role !== "admin") throw new HttpError(403, "Yetkiniz yok");
  return user;
}

interface RecentAddress {
  address: string;
  details: string | null;
  lat: number;
  lng: number;
  contactName: string | null;
  contactPhone: string | null;
}

export async function handleAdminOrder(req: Request, ctx: Ctx): Promise<Response> {
  const admin = await requireAdmin(req, ctx);
  const body = (await readJson(req)) as Record<string, unknown>;

  if (body.action === "lookup") {
    const c = await findCustomerByPhone(ctx, String(body.phone ?? ""));
    if (!c || c.deleted_at) return json({ customer: null });
    if (c.role !== "musteri") throw new HttpError(409, "Bu numara bir kurye veya yöneticiye ait");
    const { data: orders } = await ctx.admin
      .from("orders")
      .select(
        "pickup_address, pickup_details, pickup_lat, pickup_lng, pickup_contact_name, pickup_contact_phone, dropoff_address, dropoff_details, dropoff_lat, dropoff_lng, dropoff_contact_name, dropoff_contact_phone",
      )
      .eq("customer_id", c.id)
      .order("created_at", { ascending: false })
      .limit(10);
    // Son siparişlerdeki adresler (tekrarsız, en yeni önce)
    const seen = new Set<string>();
    const recent: RecentAddress[] = [];
    // deno-lint-ignore no-explicit-any
    for (const o of (orders ?? []) as Array<Record<string, any>>) {
      for (const side of ["pickup", "dropoff"] as const) {
        const address = o[`${side}_address`] as string;
        if (!address || seen.has(address)) continue;
        seen.add(address);
        recent.push({
          address,
          details: o[`${side}_details`],
          lat: o[`${side}_lat`],
          lng: o[`${side}_lng`],
          contactName: o[`${side}_contact_name`],
          contactPhone: o[`${side}_contact_phone`],
        });
      }
    }
    return json({
      customer: {
        id: c.id,
        fullName: c.full_name,
        email: c.email,
        corporateAccountId: c.corporate_account_id,
        hasConsent: await hasOrderConsent(ctx, c.id),
        recentAddresses: recent.slice(0, 6),
      },
    });
  }

  if (body.action === "create") {
    const fullName = typeof body.fullName === "string" ? body.fullName.trim().slice(0, 100) : "";
    const order = parseOrderRequest(body.order);
    if (order.paymentMethod === "kart") {
      throw new HttpError(400, "Telefon siparişinde ödeme kuryeye veya cari hesaba yapılır", "paymentMethod");
    }
    const existing = await findCustomerByPhone(ctx, String(body.phone ?? ""));
    if (existing && existing.role !== "musteri") throw new HttpError(409, "Bu numara bir kurye veya yöneticiye ait");
    const customer = await findOrCreateCustomerDefault(ctx, String(body.phone ?? ""), fullName || null);
    if (fullName && !customer.fullName) {
      await ctx.admin.from("profiles").update({ full_name: fullName }).eq("id", customer.profileId);
    }

    if (!(await hasOrderConsent(ctx, customer.profileId))) {
      if (body.verbalConsent !== true) {
        throw new HttpError(400, "Müşteriden KVKK onayı alınmalı (aydınlatma metnini okuyup sözlü onayını işaretleyin)", "verbalConsent");
      }
      const { error } = await ctx.admin.from("consents").insert(
        (["kvkk_aydinlatma", "acik_riza_konum"] as const).map((t) => ({
          profile_id: customer.profileId,
          consent_type: t,
          granted: true,
          version: KVKK_VERSION,
          user_agent: "panel:telefon (sözlü)",
          recorded_by: admin.id,
        })),
      );
      if (error) throw new Error(`Onay kaydedilemedi: ${error.message}`);
    }

    const { order: o, quote } = await createOrderForCustomer(ctx, customer.profileId, order);
    return json({ order: o, customerId: customer.profileId, isNewCustomer: customer.isNew, totalKurus: quote.quote.totalKurus }, 201);
  }

  throw new HttpError(400, "Bilinmeyen işlem");
}
