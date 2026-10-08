"use client";

import { formatTL, INCIDENT_KINDS } from "@yazgan/shared";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart } from "@/components/BarChart";
import { LeafletMap } from "@/components/LeafletMap";
import { ACTIVE_STATUSES, buildMapLayers } from "@/components/MapLayers";
import { SlaBadge } from "@/components/SlaBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { buttonClass, Card, cx, EmptyState, ErrorText, PageHeader, Stat, Table, Td } from "@/components/ui";
import { loadNavCounts } from "@/lib/alerts";
import { fmtDateTime, fmtTime, istDate } from "@/lib/dates";
import { dayCoverage, isSlaRisk, isUnassignedTooLong, recentOrDate } from "@/lib/ops";
import { repo, type AdminOrder } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

type AlertTone = "critical" | "warn" | "info";
interface Alert {
  key: string;
  tone: AlertTone;
  label: string;
  count?: number;
  href: string;
}

const CHIP_TONE: Record<AlertTone, string> = {
  critical: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100",
  warn: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
  info: "border-line bg-white text-brand hover:bg-canvas",
};
const DOT_TONE: Record<AlertTone, string> = { critical: "bg-red-600", warn: "bg-amber-500", info: "bg-brand" };

/** Health issues already covered by dedicated chips */
const COVERED_HEALTH_KEYS = new Set(["orders_waiting", "invoices_failed"]);

interface FeedItem {
  at: string;
  text: ReactNode;
  tone: "ok" | "info" | "warn" | "critical";
}

/** Whole-lira amount for KPI tiles (exact amounts live in reports) */
const roundTL = (kurus: number) => `${Math.round(kurus / 100).toLocaleString("tr-TR")} TL`;

const hourOf = (iso: string) => Number(new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false })) % 24;

export default function Dashboard() {
  const today = istDate();
  const yesterday = istDate(new Date(Date.now() - 86_400_000));
  const weekAgo = istDate(new Date(Date.now() - 7 * 86_400_000));
  const { data, error, reload } = useLoad(async () => {
    const [recent, active, couriers, ops, plan, incidents, ratings, health, counts] = await Promise.all([
      repo.listOrders({ from: yesterday, to: today }),
      repo.listOrders({ statuses: ACTIVE_STATUSES }),
      repo.listCouriers(),
      repo.getOpsSettings(),
      repo.listShiftPlan(today, 1),
      repo.listIncidents({ limit: 10 }),
      repo.listRatings({ from: weekAgo, to: today }),
      repo.getSystemHealth().catch(() => null),
      loadNavCounts(true),
    ]);
    return { recent, active, couriers, ops, plan, incidents, ratings, health, counts };
  }, [today]);

  useEffect(() => repo.subscribeOrders(reload), [reload]);
  useEffect(() => repo.subscribeIncidents(reload), [reload]);
  // SLA countdowns and "x min waiting" alerts move with time
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const todayOrders = useMemo(() => (data?.recent ?? []).filter((o) => istDate(o.createdAt) === today), [data, today]);
  const delivered = todayOrders.filter((o) => o.status === "teslim_edildi");
  const revenue = delivered.reduce((s, o) => s + o.subtotalKurus, 0);
  const open = (data?.active ?? []).filter((o) => o.status === "beklemede" || o.status === "onaylandi" || o.status === "sorunlu");
  const moving = (data?.active ?? []).filter((o) => o.status === "kuryeye_atandi" || o.status === "alindi" || o.status === "yolda");
  const unassigned = (data?.active ?? []).filter((o) => o.status === "beklemede" || o.status === "onaylandi");
  const coverage = data ? dayCoverage(data.plan.templates, data.plan.bookings, today) : null;

  const alerts = useMemo<Alert[]>(() => {
    if (!data) return [];
    const list: Alert[] = [];
    const single = (orders: AdminOrder[]) => (orders.length === 1 ? `/siparisler/${orders[0]!.id}` : "/siparisler");
    const sos = data.incidents.filter((i) => !i.resolvedAt);
    if (sos.length) list.push({ key: "sos", tone: "critical", label: "Açık acil durum", count: sos.length, href: "#sos-banner" });
    const sla = data.active.filter((o) => isSlaRisk(o, now));
    if (sla.length) list.push({ key: "sla", tone: "critical", label: "Acil taahhüdü riskte", count: sla.length, href: single(sla) });
    const waiting = data.active.filter((o) => isUnassignedTooLong(o, data.ops.unassignedAlertMinutes, now));
    if (waiting.length) list.push({ key: "wait", tone: "warn", label: `${data.ops.unassignedAlertMinutes} dk'dan uzun atamasız`, count: waiting.length, href: single(waiting) });
    if (data.counts.handoff) list.push({ key: "handoff", tone: "warn", label: "Temsilci bekleyen konuşma", count: data.counts.handoff, href: "/asistan" });
    if (data.counts.failedInvoices) list.push({ key: "inv", tone: "critical", label: "Kesilemeyen fatura", count: data.counts.failedInvoices, href: "/faturalar" });
    for (const i of data.health?.issues ?? []) {
      if (COVERED_HEALTH_KEYS.has(i.key)) continue;
      list.push({ key: `health-${i.key}`, tone: i.severity === "critical" ? "critical" : "warn", label: i.message, href: "/otomasyon" });
    }
    if (data.counts.newApplications) list.push({ key: "apps", tone: "info", label: "Yeni başvuru", count: data.counts.newApplications, href: "/basvurular" });
    return list;
  }, [data, now]);

  const hourly = useMemo(() => {
    const counts = Array.from({ length: 24 }, () => 0);
    for (const o of todayOrders) counts[hourOf(o.createdAt)]!++;
    return counts.map((value, h) => ({ label: String(h).padStart(2, "0"), value, title: `${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00` }));
  }, [todayOrders]);

  const feed = useMemo<FeedItem[]>(() => {
    if (!data) return [];
    const items: FeedItem[] = [];
    const link = (o: { id: string; orderNo: string }) => (
      <Link href={`/siparisler/${o.id}`} className="font-semibold text-brand underline-offset-2 hover:underline">
        {o.orderNo}
      </Link>
    );
    for (const o of data.recent) {
      items.push({ at: o.createdAt, tone: "info", text: <>Yeni sipariş {link(o)} · {o.customerName ?? "Müşteri"}</> });
      if (o.deliveredAt) items.push({ at: o.deliveredAt, tone: "ok", text: <>Teslim edildi {link(o)}{o.courierName ? ` · ${o.courierName}` : ""}</> });
      if (o.returnedAt) items.push({ at: o.returnedAt, tone: "warn", text: <>Göndericiye iade {link(o)}</> });
    }
    for (const r of data.ratings) {
      items.push({
        at: r.createdAt,
        tone: r.score <= 3 ? "warn" : "ok",
        text: (
          <>
            {r.score}/5 puan {link({ id: r.orderId, orderNo: r.orderNo })}
            {r.comment ? <span className="text-muted"> · “{r.comment}”</span> : null}
          </>
        ),
      });
    }
    for (const i of data.incidents) {
      items.push({ at: i.createdAt, tone: "critical", text: <>Acil durum · {i.courierName ?? "Kurye"} · {INCIDENT_KINDS[i.kind]}</> });
      if (i.resolvedAt) items.push({ at: i.resolvedAt, tone: "ok", text: <>Acil durum kapandı · {i.courierName ?? "Kurye"}</> });
    }
    return items.filter((x) => new Date(x.at).getTime() <= now).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  }, [data, now]);

  const mapLayers = useMemo(
    () => (data ? buildMapLayers(data.active, data.couriers, data.ops.locationMaxAgeMinutes, { routes: false }) : { pins: [], lines: [] }),
    [data],
  );
  const couriers = [...(data?.couriers ?? [])]
    .filter((c) => c.active)
    .sort((a, b) => Number(b.isOnShift) - Number(a.isOnShift) || b.activeOrderCount - a.activeOrderCount);
  const onShift = couriers.filter((c) => c.isOnShift).length;

  return (
    <>
      <PageHeader
        title="Genel bakış"
        subtitle={`Bugün: ${new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "full" })}`}
        actions={
          <Link href="/siparisler/yeni" className={buttonClass("primary")}>
            + Telefon siparişi
          </Link>
        }
      />
      <ErrorText>{error}</ErrorText>

      {/* Alert strip: everything that needs a human, each chip links to where it is handled */}
      <section aria-label="Uyarılar" className="mb-5" data-testid="alert-strip">
        {!data ? (
          <div className="h-10 animate-pulse rounded-card bg-white/70" />
        ) : alerts.length ? (
          <ul className="flex flex-wrap gap-2">
            {alerts.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className={cx("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition", CHIP_TONE[a.tone])}>
                  <span className={cx("h-2 w-2 rounded-full", DOT_TONE[a.tone])} aria-hidden="true" />
                  {a.label}
                  {a.count != null ? <span className="tabular-nums">· {a.count}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-card border border-line bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Her şey yolunda — bekleyen uyarı yok.
          </p>
        )}
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Bugünkü sipariş" value={data ? todayOrders.length : "…"} />
        <Stat label="Yolda / atanmış" value={data ? moving.length : "…"} />
        <Stat label="Teslim edilen" value={data ? delivered.length : "…"} hint="Bugün" />
        <Stat label="Bugünkü ciro" value={data ? roundTL(revenue) : "…"} hint={data ? `KDV hariç · ${formatTL(revenue)}` : undefined} />
        <Stat label="Atama bekleyen" value={data ? unassigned.length : "…"} tone={unassigned.length ? "warn" : "default"} href="/harita" hint="Haritada gör" />
        <Stat
          label="Vardiya kapsaması"
          value={coverage ? (coverage.pct == null ? "—" : `%${coverage.pct}`) : "…"}
          tone={coverage?.pct != null && coverage.pct < 100 ? "warn" : "default"}
          hint={coverage ? (coverage.required ? `Bugün · ${coverage.filled}/${coverage.required} kurye-dilim` : "Bugün plan yok") : undefined}
          href="/vardiya-plani"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <Card
            className="h-full"
            title="İşlem bekleyen siparişler"
            actions={
              <Link href="/siparisler" className="text-sm font-semibold text-brand underline-offset-2 hover:underline">
                Tüm siparişler →
              </Link>
            }
          >
            <Table
              head={["No", "Durum", "Nereden → Nereye", "Tutar"]}
              num={[3]}
              empty={
                <EmptyState
                  sticker="kutu"
                  title="Bekleyen sipariş yok"
                  description="Yeni ve kurye bekleyen siparişler burada görünür. Telefonla gelen siparişi hemen girebilirsiniz."
                  action={
                    <Link href="/siparisler/yeni" className={buttonClass("secondary", "sm")}>
                      Telefon siparişi gir
                    </Link>
                  }
                />
              }
            >
              {open.map((o) => (
                <tr key={o.id} className="hover:bg-canvas">
                  <Td className="whitespace-nowrap">
                    <Link className="font-semibold text-brand hover:underline" href={`/siparisler/${o.id}`}>
                      {o.orderNo}
                    </Link>
                    {o.urgent ? <div className="text-[11px] font-bold text-amber-700">ACİL</div> : null}
                    <div className="text-xs text-muted">{fmtTime(o.createdAt)}</div>
                    <SlaBadge o={o} now={now} />
                  </Td>
                  <Td>
                    <StatusBadge status={o.status} />
                    {o.paymentMethod === "kart" && o.paymentStatus === "odenmedi" ? <div className="mt-1 text-xs font-semibold text-red-700">Ödeme bekleniyor</div> : null}
                  </Td>
                  <Td className="max-w-[15rem] 2xl:max-w-md">
                    <div className="truncate">{o.pickupAddress}</div>
                    <div className="truncate text-muted">→ {o.dropoffAddress}</div>
                  </Td>
                  <Td num>{formatTL(o.totalKurus)}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        <div className="xl:col-span-5">
          <Card
            className="flex h-full flex-col"
            title="Canlı harita"
            actions={
              <Link href="/harita" className="text-sm font-semibold text-brand underline-offset-2 hover:underline">
                Haritayı aç →
              </Link>
            }
          >
            <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-control border border-line">
              <LeafletMap className="absolute inset-0" pins={mapLayers.pins} lines={mapLayers.lines} fitKey={data ? "ilk" : "bos"} interactive={false} />
              <Link href="/harita" className="absolute inset-0 z-[900]" aria-label="Canlı haritayı aç" />
            </div>
            <p className="mt-2 text-xs text-muted">
              {onShift} kurye vardiyada · {moving.length} iş yolda · {unassigned.length} atama bekliyor
            </p>
          </Card>
        </div>

        <div className="xl:col-span-4">
          <Card className="h-full" title={`Kuryeler · ${onShift} vardiyada`} actions={<Link href="/kuryeler" className="text-sm font-semibold text-brand underline-offset-2 hover:underline">Tümü →</Link>}>
            {couriers.length === 0 ? (
              <EmptyState title="Aktif kurye yok" description="Kuryeler sayfasından kurye ekleyin veya başvuruları onaylayın." />
            ) : (
              <ul className="divide-y divide-line text-sm">
                {couriers.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cx("h-2.5 w-2.5 shrink-0 rounded-full", c.onBreak ? "bg-amber-400" : c.isOnShift ? "bg-emerald-500" : "bg-slate-300")}
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium">{c.fullName}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {c.onBreak ? `Molada · ${c.activeOrderCount} aktif iş` : c.isOnShift ? `${c.activeOrderCount} aktif iş` : "Vardiya dışı"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="xl:col-span-4">
          <Card className="h-full" title="Bugün saat saat sipariş">
            {todayOrders.length ? (
              <BarChart data={hourly} format={(v) => `${v} sipariş`} axisFormat={(v) => String(Math.round(v))} height={250} labelEvery={3} ariaLabel="Bugün saat saat sipariş" />
            ) : (
              <EmptyState title="Bugün henüz sipariş yok" description="Gün içindeki siparişler saat saat burada birikir." />
            )}
          </Card>
        </div>

        <div className="xl:col-span-4">
          <Card className="h-full" title="Son olaylar">
            {feed.length === 0 ? (
              <p className="text-sm text-muted">Son 24 saatte olay yok.</p>
            ) : (
              <ol className="space-y-2.5 text-[13px]" data-testid="event-feed">
                {feed.map((f, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span
                      className={cx(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        f.tone === "ok" ? "bg-emerald-500" : f.tone === "warn" ? "bg-amber-500" : f.tone === "critical" ? "bg-red-600" : "bg-brand",
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="truncate">{f.text}</div>
                      <time className="text-xs text-muted" dateTime={f.at} title={fmtDateTime(f.at)}>
                        {recentOrDate(f.at, now)}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
