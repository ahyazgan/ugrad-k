// Sistem izleme (health Edge Function):
//  • GET (kimliksiz): kesinti izleyicisi (UptimeRobot vb.) için yalın durum — ayrıntı sızdırmaz. 200 "ok"/"degraded", 503 "down".
//  • POST + x-notify-secret (5 dakikalık cron): sorunları değerlendirir, yöneticiye yeni sorunu ve düzelmeyi bildirir.
//  • Yönetici JWT'si: panel için tam özet (uyarı göndermez).
import { alertAdmins } from "./alerts.ts";
import type { Env } from "./channels.ts";
import type { Ctx } from "./context.ts";
import { HttpError, json } from "./http.ts";

export interface HealthSnapshot {
  checked_at: string;
  notifications_stuck: number;
  notifications_failed_24h: number;
  invoices_failed: number;
  invoices_stuck: number;
  webhooks_failed_24h: number;
  webhooks_stuck: number;
  orders_waiting: number;
  orders_problem: number;
  couriers_on_shift: number;
  couriers_stale: number;
  /** Aktif kuryelerde süresi dolmuş / document_warn_days içinde dolacak belge sayısı */
  courier_docs_expired?: number;
  courier_docs_expiring?: number;
  heartbeats: Record<string, string>;
}

export interface HealthIssue {
  key: string;
  severity: "critical" | "warning";
  message: string;
}

/** Zamanlanmış görevler ve beklenen en uzun sessizlik (dakika) */
export const EXPECTED_JOBS: Record<string, number> = {
  "notify-dispatch": 5,
  "auto-dispatch": 5,
  "webhook-dispatch": 10,
  "invoice-dispatch": 15,
  "courier-earnings": 15,
};
const REALERT_MS = 6 * 3600_000;

export function evaluateHealth(s: HealthSnapshot, now: Date, jobs: Record<string, number> = EXPECTED_JOBS): HealthIssue[] {
  const out: HealthIssue[] = [];
  const add = (key: string, severity: HealthIssue["severity"], message: string) => out.push({ key, severity, message });
  for (const [job, maxMin] of Object.entries(jobs)) {
    const last = s.heartbeats[job];
    if (!last) add(`job:${job}`, "critical", `${job} zamanlanmış görevi hiç çalışmadı (cron kurulu mu?)`);
    else {
      const min = Math.floor((now.getTime() - new Date(last).getTime()) / 60_000);
      if (min > maxMin) add(`job:${job}`, "critical", `${job} ${min} dakikadır çalışmadı`);
    }
  }
  if (s.notifications_stuck > 0) add("notifications_stuck", "critical", `${s.notifications_stuck} bildirim 10 dakikadan uzun süredir gönderilemedi`);
  if (s.notifications_failed_24h >= 3) add("notifications_failed", "warning", `Son 24 saatte ${s.notifications_failed_24h} bildirim başarısız (SMS/WhatsApp ayarları?)`);
  if (s.orders_waiting > 0) add("orders_waiting", "critical", `${s.orders_waiting} sipariş 30 dakikadan uzun süredir kurye bekliyor`);
  if (s.orders_problem > 0) add("orders_problem", "warning", `${s.orders_problem} sorunlu sipariş var`);
  if (s.invoices_failed > 0) add("invoices_failed", "warning", `${s.invoices_failed} fatura kesilemedi (panel → Faturalar)`);
  if (s.invoices_stuck > 0) add("invoices_stuck", "warning", `${s.invoices_stuck} fatura 1 saatten uzun süredir kuyrukta`);
  if (s.webhooks_failed_24h > 0) add("webhooks_failed", "warning", `Son 24 saatte ${s.webhooks_failed_24h} kurumsal webhook iletilemedi`);
  if (s.webhooks_stuck > 0) add("webhooks_stuck", "warning", `${s.webhooks_stuck} kurumsal webhook kuyrukta bekliyor`);
  if ((s.courier_docs_expired ?? 0) > 0) add("courier_docs_expired", "warning", `${s.courier_docs_expired} kurye belgesinin süresi dolmuş (panel → Kuryeler → Belgeler)`);
  if ((s.courier_docs_expiring ?? 0) > 0) add("courier_docs_expiring", "warning", `${s.courier_docs_expiring} kurye belgesinin süresi yakında doluyor (panel → Kuryeler → Belgeler)`);
  if (s.couriers_stale > 0) add("couriers_stale", "warning", `Vardiyadaki ${s.couriers_stale} kuryenin konumu 15 dakikadır gelmiyor`);
  return out;
}

async function snapshot(ctx: Ctx): Promise<HealthSnapshot> {
  const { data, error } = await ctx.admin.rpc("system_health");
  if (error || !data) throw new Error(`Sağlık özeti alınamadı: ${error?.message}`);
  return data as HealthSnapshot;
}

async function isAdmin(req: Request, ctx: Ctx) {
  if (!req.headers.get("Authorization")) return false;
  try {
    const user = await ctx.getUser(req);
    const { data } = await ctx.admin.from("profiles").select("role").eq("id", user.id).single();
    return data?.role === "admin";
  } catch {
    return false;
  }
}

export async function handleHealth(req: Request, ctx: Ctx, deps: { env: Env; fetchFn?: typeof fetch; now?: () => Date }): Promise<Response> {
  const now = (deps.now ?? (() => new Date()))();
  const secret = deps.env("NOTIFY_SECRET");
  const cron = !!secret && req.headers.get("x-notify-secret") === secret;

  if (!cron && (await isAdmin(req, ctx))) {
    const s = await snapshot(ctx);
    return json({ snapshot: s, issues: evaluateHealth(s, now) });
  }

  if (!cron) {
    if (req.method !== "GET") throw new HttpError(401, "Yetkisiz");
    // Kesinti izleyicisi: yalnızca durum
    try {
      const issues = evaluateHealth(await snapshot(ctx), now);
      return json({ status: issues.some((i) => i.severity === "critical") ? "degraded" : "ok" });
    } catch {
      return json({ status: "down" }, 503);
    }
  }

  // Cron: değerlendir + uyar
  const issues = evaluateHealth(await snapshot(ctx), now);
  const { data: openRows } = await ctx.admin.from("system_alerts").select("key, message, last_alerted_at").is("resolved_at", null);
  const open = new Map(((openRows ?? []) as Array<{ key: string; message: string; last_alerted_at: string | null }>).map((r) => [r.key, r]));
  const notify: string[] = [];
  for (const i of issues) {
    const prev = open.get(i.key);
    if (!prev) {
      await ctx.admin.from("system_alerts").insert({ key: i.key, message: i.message, first_seen_at: now.toISOString(), last_alerted_at: now.toISOString(), resolved_at: null });
      notify.push(`${i.severity === "critical" ? "🔴" : "🟠"} ${i.message}`);
    } else if (!prev.last_alerted_at || now.getTime() - new Date(prev.last_alerted_at).getTime() > REALERT_MS) {
      await ctx.admin.from("system_alerts").update({ message: i.message, last_alerted_at: now.toISOString() }).eq("key", i.key);
      notify.push(`${i.severity === "critical" ? "🔴" : "🟠"} Devam ediyor: ${i.message}`);
    }
  }
  const current = new Set(issues.map((i) => i.key));
  for (const [key, prev] of open) {
    if (current.has(key)) continue;
    await ctx.admin.from("system_alerts").update({ resolved_at: now.toISOString() }).eq("key", key);
    notify.push(`✅ Düzeldi: ${prev.message}`);
  }
  if (notify.length) await alertAdmins("Sistem durumu", notify.join("\n"), deps).catch((e) => console.error("health alert", e));
  await ctx.admin.rpc("record_heartbeat", { p_name: "health" });
  return json({ issues, notified: notify.length });
}
