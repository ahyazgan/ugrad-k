// Canlıya hazırlık denetimi (yalnız yönetici): hangi gerçek servislerin bağlı olduğu, sahte (mock) sağlayıcıyla
// çalışan parçalar, zamanlanmış görevler ve ayarlar. Gizli değerleri asla döndürmez; yalnız "var/yok".
import { EXPECTED_JOBS } from "./health.ts";
import type { Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { HttpError, json } from "./http.ts";

export type ReadinessStatus = "ok" | "uyari" | "eksik";

export interface ReadinessItem {
  key: string;
  group: "Servisler" | "Zamanlanmış görevler" | "Ayarlar" | "Operasyon";
  label: string;
  status: ReadinessStatus;
  detail: string;
  /** docs/kurulum.md bölümü */
  doc?: string;
}

export interface ReadinessFacts {
  env: Env;
  heartbeats: Record<string, string>;
  now: Date;
  pricingUpdatedBy: string | null;
  costUpdatedBy: string | null;
  holidaysNextYear: number;
  compliantCouriers: number;
  activeCouriers: number;
  admins: number;
  adminAlertPhones: number;
  winbackEnabled: boolean;
}

const has = (env: Env, ...keys: string[]) => keys.every((k) => !!env(k));

export function evaluateReadiness(f: ReadinessFacts): ReadinessItem[] {
  const out: ReadinessItem[] = [];
  const add = (i: ReadinessItem) => out.push(i);
  const svc = (key: string, label: string, keys: string[], ifMissing: string, doc: string, missingStatus: ReadinessStatus = "eksik") =>
    add({
      key,
      group: "Servisler",
      label,
      status: has(f.env, ...keys) ? "ok" : missingStatus,
      detail: has(f.env, ...keys) ? "Bağlı" : `${ifMissing} (${keys.filter((k) => !f.env(k)).join(", ")} eksik)`,
      doc,
    });

  svc("maps", "Google Maps (adres ve rota)", ["GOOGLE_MAPS_API_KEY"], "Sahte harita: örnek adresler ve kuş uçuşu mesafe", "§3");
  svc("sms", "SMS (Netgsm)", ["NETGSM_USERCODE", "NETGSM_PASSWORD", "NETGSM_HEADER"], "SMS gönderilmiyor (deneme modu)", "§4");
  svc("whatsapp", "WhatsApp Business", ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"], "WhatsApp kapalı, SMS'e düşer", "§8", "uyari");
  if (has(f.env, "IYZICO_API_KEY", "IYZICO_SECRET_KEY")) {
    const sandbox = /sandbox/i.test(f.env("IYZICO_BASE_URL") ?? "sandbox");
    add({
      key: "payment",
      group: "Servisler",
      label: "Kartla ödeme (iyzico)",
      status: sandbox ? "uyari" : "ok",
      detail: sandbox ? "Test ortamı (sandbox): gerçek para çekilmez. Canlıda IYZICO_BASE_URL=https://api.iyzipay.com" : "Canlı ortam",
      doc: "§9",
    });
  } else svc("payment", "Kartla ödeme (iyzico)", ["IYZICO_API_KEY", "IYZICO_SECRET_KEY"], "Kart ödemesi çalışmaz", "§9");
  svc(
    "invoice",
    "e-Arşiv / e-Fatura (Paraşüt)",
    ["PARASUT_CLIENT_ID", "PARASUT_CLIENT_SECRET", "PARASUT_USERNAME", "PARASUT_PASSWORD", "PARASUT_COMPANY_ID"],
    "Faturalar kesilmiyor (sahte entegratör)",
    "§10",
  );
  svc("assistant", "Yapay zeka asistanı (Claude)", ["ANTHROPIC_API_KEY"], "WhatsApp/e-posta/sesli asistan cevap vermez", "§11", "uyari");
  svc("email", "E-postayla sipariş (Postmark)", ["POSTMARK_SERVER_TOKEN", "EMAIL_INBOUND_SECRET"], "E-posta kanalı kapalı", "§20", "uyari");
  svc("cron_secret", "Zamanlanmış görev anahtarı", ["NOTIFY_SECRET"], "Cron görevleri yetkilendirilemez", "§6");
  svc("links", "Bağlantı adresleri", ["PUBLIC_TRACKING_BASE_URL", "KVKK_URL"], "Mesajlarda varsayılan alan adı kullanılır", "§15", "uyari");
  add({
    key: "admin_phones",
    group: "Operasyon",
    label: "Yönetici uyarı telefonları",
    status: f.adminAlertPhones > 0 ? "ok" : "eksik",
    detail: f.adminAlertPhones > 0 ? `${f.adminAlertPhones} numara` : "ADMIN_ALERT_PHONES boş: sorun ve yeni sipariş uyarıları kimseye gitmez",
    doc: "§15",
  });

  const jobs = { ...EXPECTED_JOBS, health: 10, ...(f.winbackEnabled ? { winback: 26 * 60 } : {}) };
  for (const [job, maxMin] of Object.entries(jobs)) {
    const last = f.heartbeats[job];
    const age = last ? Math.floor((f.now.getTime() - new Date(last).getTime()) / 60_000) : null;
    add({
      key: `job:${job}`,
      group: "Zamanlanmış görevler",
      label: job,
      status: age == null ? "eksik" : age > maxMin ? "uyari" : "ok",
      detail: age == null ? "Hiç çalışmadı: cron kaydını ekleyin" : age > maxMin ? `${age} dakikadır çalışmadı` : "Çalışıyor",
      doc: "§6",
    });
  }

  add({
    key: "pricing",
    group: "Ayarlar",
    label: "Tarife gözden geçirildi",
    status: f.pricingUpdatedBy ? "ok" : "uyari",
    detail: f.pricingUpdatedBy ? "Panelden kaydedilmiş" : "Varsayılan tarife hiç kaydedilmedi (Fiyatlar)",
  });
  add({
    key: "cost",
    group: "Ayarlar",
    label: "Kurye ödeme modeli",
    status: f.costUpdatedBy ? "ok" : "uyari",
    detail: f.costUpdatedBy ? "Panelden kaydedilmiş" : "Varsayılan öneri değerler kullanılıyor; kuryelerle anlaştığınız rakamları girin (Fiyatlar)",
    doc: "§23",
  });
  add({
    key: "holidays",
    group: "Ayarlar",
    label: "Gelecek yılın resmi tatilleri",
    status: f.holidaysNextYear > 0 ? "ok" : "uyari",
    detail: f.holidaysNextYear > 0 ? `${f.holidaysNextYear} gün tanımlı` : "Gelecek yıl için tatil girilmemiş (Fiyatlar → Resmi tatiller)",
  });
  add({
    key: "admins",
    group: "Operasyon",
    label: "Yönetici hesabı",
    status: f.admins > 0 ? "ok" : "eksik",
    detail: f.admins > 0 ? `${f.admins} yönetici` : "Yönetici yok",
  });
  add({
    key: "couriers",
    group: "Operasyon",
    label: "Belgeleri tam aktif kurye",
    status: f.compliantCouriers > 0 ? "ok" : "eksik",
    detail: `${f.compliantCouriers} / ${f.activeCouriers} aktif kuryenin zorunlu belgeleri tam`,
    doc: "§24",
  });
  return out;
}

export async function handleReadiness(req: Request, ctx: Ctx, deps: { env: Env; now?: () => Date }): Promise<Response> {
  const user = await ctx.getUser(req);
  const { data: me } = await ctx.admin.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") throw new HttpError(403, "Yalnız yönetici");
  const now = (deps.now ?? (() => new Date()))();
  const nextYear = `${now.getUTCFullYear() + 1}-01-01`;
  const [hb, pricing, cost, hol, couriers, admins, ops] = await Promise.all([
    ctx.admin.from("system_heartbeats").select("name, last_run_at"),
    ctx.admin.from("pricing_settings").select("updated_by").eq("id", 1).single(),
    ctx.admin.from("cost_settings").select("updated_by").eq("id", 1).single(),
    ctx.admin.from("holidays").select("date").gte("date", nextYear),
    ctx.admin.from("couriers").select("id").eq("active", true),
    ctx.admin.from("profiles").select("id").eq("role", "admin"),
    ctx.admin.from("ops_settings").select("winback_enabled").eq("id", 1).single(),
  ]);
  const active = ((couriers.data ?? []) as Array<{ id: string }>).map((c) => c.id);
  let compliant = 0;
  for (const id of active) {
    const { data } = await ctx.admin.rpc("courier_document_problems", { p_courier_id: id });
    if (Array.isArray(data) && data.length === 0) compliant++;
  }
  const items = evaluateReadiness({
    env: deps.env,
    now,
    heartbeats: Object.fromEntries(((hb.data ?? []) as Array<{ name: string; last_run_at: string }>).map((r) => [r.name, r.last_run_at])),
    pricingUpdatedBy: (pricing.data as { updated_by?: string } | null)?.updated_by ?? null,
    costUpdatedBy: (cost.data as { updated_by?: string } | null)?.updated_by ?? null,
    holidaysNextYear: ((hol.data ?? []) as unknown[]).filter((h) => String((h as { date: string }).date) >= nextYear).length,
    compliantCouriers: compliant,
    activeCouriers: active.length,
    admins: (admins.data ?? []).length,
    adminAlertPhones: (deps.env("ADMIN_ALERT_PHONES") ?? "").split(",").filter((s) => s.trim()).length,
    winbackEnabled: !!(ops.data as { winback_enabled?: boolean } | null)?.winback_enabled,
  });
  return json({ items, ready: !items.some((i) => i.status === "eksik") });
}
