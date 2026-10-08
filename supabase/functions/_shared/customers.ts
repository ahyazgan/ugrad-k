// Telefon numarasıyla müşteri bulma/oluşturma (WhatsApp asistanı ve telefon siparişi ortak).
import type { Ctx } from "./context.ts";
import { HttpError } from "./http.ts";
import { normalizeTrMobile } from "./netgsm.ts";

/** "+90 532 123 45 67" / "05321234567" → "905321234567" (geçersizse hata) */
export const phoneKey = (phone: string) => {
  try {
    return `90${normalizeTrMobile(phone)}`;
  } catch {
    throw new HttpError(400, "Geçerli bir cep telefonu numarası girin", "phone");
  }
};

export async function findCustomerByPhone(ctx: Ctx, phone: string) {
  const key = phoneKey(phone);
  const { data } = await ctx.admin
    .from("profiles")
    .select("id, full_name, email, role, corporate_account_id, deleted_at")
    .in("phone", [key, `+${key}`])
    .limit(1)
    .maybeSingle();
  return data as
    | { id: string; full_name: string | null; email: string | null; role: string; corporate_account_id: string | null; deleted_at: string | null }
    | null;
}

export async function findOrCreateCustomerDefault(ctx: Ctx, phone: string, fullName?: string | null) {
  const existing = await findCustomerByPhone(ctx, phone);
  if (existing) return { profileId: existing.id, fullName: existing.full_name, isNew: false };
  const { data, error } = await ctx.admin.auth.admin.createUser({
    phone: phoneKey(phone),
    phone_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });
  if (error || !data.user) throw new Error(`Müşteri oluşturulamadı: ${error?.message}`);
  return { profileId: data.user.id, fullName: fullName ?? null, isNew: true };
}

export async function hasOrderConsent(ctx: Ctx, profileId: string) {
  const { data } = await ctx.admin.from("current_consents").select("consent_type, granted").eq("profile_id", profileId);
  const ok = new Set(((data ?? []) as Array<{ consent_type: string; granted: boolean }>).filter((c) => c.granted).map((c) => c.consent_type));
  return ok.has("kvkk_aydinlatma") && ok.has("acik_riza_konum");
}
