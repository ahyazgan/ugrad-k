// Tanıtım sitesi API'si (giriş gerektirmez): fiyat hesaplama, adres arama, kurumsal başvuru.
// Google maliyetini korumak için IP başına ve günlük toplam hız sınırı uygulanır.
import { BRAND, buildQuote, parseOrderRequest } from "../../../packages/shared/index.ts";
import { alertAdmins } from "./alerts.ts";
import type { Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { phoneKey } from "./customers.ts";
import { quoteResponse } from "./handlers.ts";
import { HttpError, json, readJson } from "./http.ts";

// deno-lint-ignore no-explicit-any
type Body = Record<string, any>;

export const SITE_LIMITS = {
  quote: { perIp: 30, windowSeconds: 600 },
  places: { perIp: 150, windowSeconds: 600 },
  lead: { perIp: 5, windowSeconds: 3600 },
  courierApply: { perIp: 3, windowSeconds: 3600 },
  rate: { perIp: 10, windowSeconds: 3600 },
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
    case "courier-apply": {
      await rateLimit(ctx, `site:courier:${ip}`, SITE_LIMITS.courierApply.perIp, SITE_LIMITS.courierApply.windowSeconds);
      return json(await courierApply(ctx, (body.application ?? {}) as Body, deps));
    }
    case "rate": {
      await rateLimit(ctx, `site:rate:${ip}`, SITE_LIMITS.rate.perIp, SITE_LIMITS.rate.windowSeconds);
      return json(await rateOrder(ctx, body, deps));
    }
    default:
      throw new HttpError(400, "Bilinmeyen işlem");
  }
}

export const APPLICATION_DOCS = {
  ehliyet_on: "Ehliyet (ön yüz)",
  ehliyet_arka: "Ehliyet (arka yüz)",
  ruhsat: "Motosiklet ruhsatı",
  vesikalik: "Vesikalık fotoğraf",
} as const;
const DOC_EXT = ["jpg", "jpeg", "png", "webp", "heic", "pdf"];

/** Kurye başvurusu: kaydı oluşturur ve belgeler için tek kullanımlık imzalı yükleme adresleri döner. */
async function courierApply(ctx: Ctx, a: Body, deps: { env: Env; fetchFn?: typeof fetch }) {
  if (typeof a.website === "string" && a.website.trim()) return { id: null, uploads: [] }; // bal küpü
  if (a.kvkkConsent !== true) throw new HttpError(400, "Aydınlatma metnini onaylamanız gerekiyor", "kvkkConsent");
  const year = new Date().getUTCFullYear();
  const birthYear = a.birthYear == null || a.birthYear === "" ? null : Number(a.birthYear);
  if (birthYear != null && (!Number.isInteger(birthYear) || birthYear < 1940 || birthYear > year - 18)) {
    throw new HttpError(400, "Başvuru için 18 yaşını doldurmuş olmalısınız", "birthYear");
  }
  const exp = a.experienceYears == null || a.experienceYears === "" ? null : Number(a.experienceYears);
  if (exp != null && (!Number.isInteger(exp) || exp < 0 || exp > 60)) throw new HttpError(400, "Deneyim yılı geçersiz", "experienceYears");
  const availability = ["tam_zamanli", "yari_zamanli", "hafta_sonu"].includes(a.availability) ? a.availability : null;
  const email = text(a.email, 200, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Geçerli bir e-posta girin", "email");

  const docs = (Array.isArray(a.documents) ? a.documents : []).slice(0, 4) as Body[];
  const documents = docs.map((d) => {
    if (!(d?.kind in APPLICATION_DOCS)) throw new HttpError(400, "Belge türü geçersiz", "documents");
    const ext = String(d.ext ?? "").toLowerCase();
    if (!DOC_EXT.includes(ext)) throw new HttpError(400, "Belge JPG, PNG veya PDF olmalı", "documents");
    return { kind: d.kind as keyof typeof APPLICATION_DOCS, path: "", ext };
  });
  if (new Set(documents.map((d) => d.kind)).size !== documents.length) throw new HttpError(400, "Aynı belge iki kez yüklenemez", "documents");

  const row = {
    full_name: text(a.fullName, 120, "fullName", true),
    phone: `+${phoneKey(String(a.phone ?? ""))}`,
    email,
    district: text(a.district, 60, "district"),
    birth_year: birthYear,
    license_class: text(a.licenseClass, 20, "licenseClass"),
    has_motorcycle: a.hasMotorcycle === true,
    plate: text(a.plate, 20, "plate")?.toLocaleUpperCase("tr-TR") ?? null,
    vehicle_model: text(a.vehicleModel, 80, "vehicleModel"),
    experience_years: exp,
    availability,
    message: text(a.message, 2000, "message"),
    kvkk_consent_at: new Date().toISOString(),
  };
  const { data: created, error } = await ctx.admin.from("courier_applications").insert(row).select("id").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new HttpError(409, "Bu numarayla değerlendirmede olan bir başvurunuz var; sizi arayacağız", "phone");
    }
    throw new Error(`Başvuru kaydedilemedi: ${error.message}`);
  }
  const id = (created as { id: string }).id;

  const uploads: Array<{ kind: string; signedUrl: string; path: string }> = [];
  for (const d of documents) {
    const path = `${id}/${d.kind}-${crypto.randomUUID().slice(0, 8)}.${d.ext}`;
    const { data, error: upErr } = await ctx.admin.storage.from("basvuru").createSignedUploadUrl(path);
    if (upErr || !data) throw new Error(`Yükleme adresi oluşturulamadı: ${upErr?.message}`);
    d.path = path;
    uploads.push({ kind: d.kind, signedUrl: data.signedUrl, path });
  }
  if (documents.length) {
    await ctx.admin
      .from("courier_applications")
      .update({ documents: documents.map(({ kind, path }) => ({ kind, path })) })
      .eq("id", id);
  }
  await alertAdmins(
    "Yeni kurye başvurusu",
    `Kurye başvurusu: ${row.full_name}, ${row.phone}${row.district ? `, ${row.district}` : ""}${row.has_motorcycle ? ", motoru var" : ""}`,
    deps,
  ).catch((e) => console.error("courier alert", e));
  return { id, uploads };
}

/** Düşük puan eşiği: bu ve altı yöneticiye anında bildirilir */
export const LOW_RATING = 3;

/** Teslim sonrası değerlendirme (takip sayfası ve uygulama) */
async function rateOrder(ctx: Ctx, b: Body, deps: { env: Env; fetchFn?: typeof fetch }) {
  const token = typeof b.token === "string" ? b.token : "";
  const score = Number(b.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new HttpError(400, "1 ile 5 arasında puan verin", "score");
  const comment = text(b.comment, 1000, "comment");
  const { data: r, error } = await ctx.admin.rpc("submit_rating", {
    p_token: token,
    p_score: score,
    p_comment: comment,
    p_source: b.source === "uygulama" ? "uygulama" : "takip",
  });
  if (error) throw new Error(`Değerlendirme kaydedilemedi: ${error.message}`);
  if (r === "not_found") throw new HttpError(404, "Sipariş bulunamadı");
  if (r === "not_delivered") throw new HttpError(409, "Sipariş teslim edildikten sonra değerlendirebilirsiniz");
  if (r === "expired") throw new HttpError(410, "Değerlendirme süresi doldu");
  if (r === "exists") throw new HttpError(409, "Bu sipariş zaten değerlendirildi");

  if (score <= LOW_RATING) {
    const { data: o } = await ctx.admin
      .from("orders")
      .select("order_no, courier:couriers(profile:profiles(full_name)), customer:profiles!orders_customer_id_fkey(full_name, phone)")
      .eq("tracking_token", token)
      .maybeSingle();
    const row = (o ?? {}) as { order_no?: string; courier?: { profile?: { full_name?: string } }; customer?: { full_name?: string; phone?: string } };
    const courierName = row.courier?.profile?.full_name;
    await alertAdmins(
      "Düşük puan",
      `${row.order_no ?? "Sipariş"} ${score}/5${courierName ? ` (kurye ${courierName})` : ""}${comment ? `: ${comment}` : ""} — müşteri ${row.customer?.full_name ?? ""} ${row.customer?.phone ?? ""}`.trim(),
      deps,
    ).catch((e) => console.error("rating alert", e));
  }
  const googleReviewUrl = score === 5 ? deps.env("GOOGLE_REVIEW_URL") || BRAND.googleReviewUrl || null : null;
  return { ok: true, googleReviewUrl };
}
