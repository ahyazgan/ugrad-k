// Tanıtım sitesi API'si (giriş gerektirmez): fiyat hesaplama, adres arama, kurumsal başvuru.
// Google maliyetini korumak için IP başına ve günlük toplam hız sınırı uygulanır.
import { buildQuote, parseOrderRequest } from "../../../packages/shared/index.ts";
import { alertAdmins } from "./alerts.ts";
import type { Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { quoteResponse } from "./handlers.ts";
import { HttpError, json, readJson } from "./http.ts";

// deno-lint-ignore no-explicit-any
type Body = Record<string, any>;

export const SITE_LIMITS = {
  quote: { perIp: 30, windowSeconds: 600 },
  places: { perIp: 150, windowSeconds: 600 },
  lead: { perIp: 5, windowSeconds: 3600 },
  /** Tüm ziyaretçiler için günlük üst sınır (Google faturasını sınırlar) */
  quotePerDay: 3000,
};

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "bilinmiyor";
}

export async function rateLimit(ctx: Ctx, key: string, limit: number, windowSeconds: number) {
  const { data, error } = await ctx.admin.rpc("hit_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) {
    // Sayaç çalışmıyorsa hizmeti durdurmayalım, ama loglayalım
    console.error("rate limit", error.message);
    return;
  }
  if (data === false) throw new HttpError(429, "Çok fazla istek gönderildi, lütfen biraz sonra tekrar deneyin");
}

/** Türkiye telefonu (cep veya sabit) → +90XXXXXXXXXX */
export function normalizeTrPhone(raw: string): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("90") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  if (!/^[2-5]\d{9}$/.test(d)) throw new HttpError(400, "Geçerli bir telefon numarası girin", "phone");
  return `+90${d}`;
}

const text = (v: unknown, max: number, field: string, required = false): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (required) throw new HttpError(400, "Bu alan zorunludur", field);
    return null;
  }
  if (s.length > max) throw new HttpError(400, `En fazla ${max} karakter girin`, field);
  return s;
};

export async function handleSite(req: Request, ctx: Ctx, deps: { env: Env; fetchFn?: typeof fetch }): Promise<Response> {
  const body = (await readJson(req)) as Body;
  const ip = clientIp(req);

  switch (body.action) {
    case "quote": {
      await rateLimit(ctx, `site:quote:${ip}`, SITE_LIMITS.quote.perIp, SITE_LIMITS.quote.windowSeconds);
      await rateLimit(ctx, `site:quote:gun:${new Date().toISOString().slice(0, 10)}`, SITE_LIMITS.quotePerDay, 86_400);
      const order = parseOrderRequest(body.order);
      const pricing = await ctx.loadPricing();
      const q = await buildQuote(order, { maps: ctx.maps, ...pricing });
      return json(quoteResponse(q));
    }
    case "places": {
      await rateLimit(ctx, `site:places:${ip}`, SITE_LIMITS.places.perIp, SITE_LIMITS.places.windowSeconds);
      const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken.slice(0, 100) : undefined;
      if (typeof body.placeId === "string" && body.placeId) {
        return json({ place: await ctx.maps.placeDetails(body.placeId.slice(0, 300), sessionToken) });
      }
      const input = typeof body.input === "string" ? body.input.trim() : "";
      if (input.length < 3) return json({ suggestions: [] });
      if (input.length > 200) throw new HttpError(400, "Arama metni çok uzun");
      return json({ suggestions: await ctx.maps.autocomplete(input, sessionToken) });
    }
    case "lead": {
      await rateLimit(ctx, `site:lead:${ip}`, SITE_LIMITS.lead.perIp, SITE_LIMITS.lead.windowSeconds);
      const l = (body.lead ?? {}) as Body;
      // Bal küpü: botlar gizli alanı doldurur → sessizce kabul et, kaydetme
      if (typeof l.website === "string" && l.website.trim()) return json({ ok: true });
      if (l.kvkkConsent !== true) throw new HttpError(400, "Aydınlatma metnini onaylamanız gerekiyor", "kvkkConsent");
      const kind = l.kind === "iletisim" ? "iletisim" : "kurumsal";
      const email = text(l.email, 200, "email");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Geçerli bir e-posta girin", "email");
      const row = {
        kind,
        company_name: text(l.companyName, 200, "companyName", kind === "kurumsal"),
        contact_name: text(l.contactName, 120, "contactName", true),
        phone: normalizeTrPhone(l.phone),
        email,
        district: text(l.district, 60, "district"),
        monthly_volume: text(l.monthlyVolume, 40, "monthlyVolume"),
        message: text(l.message, 2000, "message"),
        source_page: text(l.sourcePage, 200, "sourcePage"),
        kvkk_consent_at: new Date().toISOString(),
      };
      const { error } = await ctx.admin.from("leads").insert(row);
      if (error) throw new Error(`Başvuru kaydedilemedi: ${error.message}`);
      await alertAdmins(
        "Yeni web başvurusu",
        `Web: ${kind === "kurumsal" ? "kurumsal başvuru" : "iletişim"} — ${row.company_name ?? row.contact_name}, ${row.phone}${row.monthly_volume ? `, ayda ${row.monthly_volume}` : ""}`,
        deps,
      ).catch((e) => console.error("lead alert", e));
      return json({ ok: true });
    }
    default:
      throw new HttpError(400, "Bilinmeyen işlem");
  }
}
