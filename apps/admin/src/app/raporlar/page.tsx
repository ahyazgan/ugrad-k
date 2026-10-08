"use client";

import { formatTL } from "@yazgan/shared";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { BarChart } from "@/components/BarChart";
import { Button, Card, ErrorText, Input, PageHeader, Stat, Table, Td } from "@/components/ui";
import { istDate } from "@/lib/dates";
import { repo } from "@/lib/repo";
import { buildReport, ordersCsv, URGENT_TARGET_MIN } from "@/lib/reports";
import { useLoad } from "@/lib/use-load";

const DAY_MS = 86_400_000;
const daysAgo = (n: number) => istDate(new Date(Date.now() - n * DAY_MS));
const pct = (r: number | null) => (r == null ? "—" : `%${Math.round(r * 100)}`);
const minutes = (m: number | null) => (m == null ? "—" : `${m} dk`);
const compactTL = (k: number) => {
  const tl = k / 100;
  return tl >= 1000 ? `${(tl / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} bin TL` : `${Math.round(tl)} TL`;
};
const dayLabel = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`;
const dayTitle = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("tr-TR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "long" });

function presets(): Array<[string, string, string]> {
  const today = istDate();
  const [y, m] = today.split("-").map(Number) as [number, number];
  const monthStart = `${today.slice(0, 7)}-01`;
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const prevEnd = istDate(new Date(new Date(`${monthStart}T12:00:00Z`).getTime() - DAY_MS));
  return [
    ["Son 7 gün", daysAgo(6), today],
    ["Son 30 gün", daysAgo(29), today],
    ["Bu ay", monthStart, today],
    ["Geçen ay", `${prev}-01`, prevEnd],
  ];
}

/** Grafik ↔ tablo görünümü olan kart */
function ChartCard({ title, chart, table }: { title: string; chart: ReactNode; table: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card
      title={title}
      actions={
        <Button variant="ghost" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "Grafik" : "Tablo"}
        </Button>
      }
    >
      {asTable ? <div className="max-h-72 overflow-y-auto">{table}</div> : chart}
    </Card>
  );
}

export default function RaporlarPage() {
  const [range, setRange] = useState({ from: daysAgo(29), to: istDate() });
  const [draft, setDraft] = useState(range);
  const { data, error, loading } = useLoad(
    async () => {
      const [orders, ratings] = await Promise.all([repo.listOrders({ from: range.from, to: range.to, limit: 20_000 }), repo.listRatings(range)]);
      return { orders, ratings };
    },
    [range],
  );
  const orders = data?.orders;
  const report = useMemo(() => (data ? buildReport(data.orders, range.from, range.to, data.ratings) : null), [data, range]);
  const t = report?.totals;
  const days = report?.daily.length ?? 0;

  const download = () => {
    if (!orders) return;
    const url = URL.createObjectURL(new Blob([ordersCsv(orders)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `siparisler_${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Raporlar"
        subtitle="Tutarlar KDV hariçtir; ciro teslim edilen siparişlerden, günler İstanbul saatine göre hesaplanır."
        actions={
          <Button variant="secondary" onClick={download} disabled={!orders?.length} data-testid="csv">
            CSV indir (Excel)
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-end gap-2">
        {presets().map(([label, from, to]) => (
          <Button
            key={label}
            variant={range.from === from && range.to === to ? "primary" : "secondary"}
            onClick={() => {
              setRange({ from, to });
              setDraft({ from, to });
            }}
          >
            {label}
          </Button>
        ))}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.from && draft.to && draft.from <= draft.to) setRange(draft);
          }}
        >
          <Input label="Başlangıç" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          <Input label="Bitiş" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          <Button type="submit" variant="secondary" disabled={!draft.from || !draft.to || draft.from > draft.to}>
            Uygula
          </Button>
        </form>
      </div>
      <ErrorText>{error}</ErrorText>
      {loading && !report ? <p className="text-sm text-slate-500">Yükleniyor…</p> : null}
      {report && t ? (
        <div className={loading ? "opacity-60" : undefined}>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="report-totals">
            <Stat label="Ciro (KDV hariç)" value={formatTL(t.revenueKurus)} hint={`${t.delivered} teslimat`} />
            <Stat label="Sipariş" value={t.orders} hint={`${t.cancelled} iptal (${pct(t.cancelRate)})${t.returned ? ` · ${t.returned} iade` : ""}`} />
            <Stat label="Ortalama sipariş" value={t.delivered ? formatTL(t.avgOrderKurus) : "—"} />
            <Stat label="Ortalama teslim süresi" value={minutes(t.avgDeliveryMin)} hint="Sipariş (veya planlı alış) → teslim" />
            <Stat
              label={`Acil zamanında (≤${URGENT_TARGET_MIN} dk)`}
              value={pct(t.urgentOnTimeRate)}
              hint={`${t.urgentDelivered} acil teslimat`}
            />
            <Stat label="Avrupa yakası payı" value={pct(t.crossSideRate)} hint="Alış veya teslimi Avrupa'da olan" />
            <Stat label="Aktif kurye" value={report.couriers.filter((c) => c.courierId).length} hint="Bu dönemde teslimat yapan" />
            <Stat label="Müşteri" value={report.customerCount} hint="Bu dönemde teslimat alan" />
            <Stat
              label="Müşteri puanı"
              value={t.avgRating != null ? `★ ${t.avgRating.toLocaleString("tr-TR")}` : "—"}
              hint={`${t.ratingCount} değerlendirme${t.ratingRate != null ? ` · teslimatların ${pct(t.ratingRate)}'i` : ""}`}
            />
          </div>

          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            <ChartCard
              title="Günlük ciro (KDV hariç)"
              chart={
                <BarChart
                  ariaLabel="Günlük ciro"
                  data={report.daily.map((d) => ({ label: dayLabel(d.date), title: `${dayTitle(d.date)} · ${d.delivered} teslimat`, value: d.revenueKurus }))}
                  format={formatTL}
                  axisFormat={compactTL}
                  labelEvery={Math.max(1, Math.ceil(days / 8))}
                />
              }
              table={
                <Table head={["Gün", "Sipariş", "Teslim", "Ciro"]}>
                  {report.daily.map((d) => (
                    <tr key={d.date}>
                      <Td>{dayTitle(d.date)}</Td>
                      <Td>{d.orders}</Td>
                      <Td>{d.delivered}</Td>
                      <Td className="whitespace-nowrap">{formatTL(d.revenueKurus)}</Td>
                    </tr>
                  ))}
                </Table>
              }
            />
            <ChartCard
              title="Saate göre sipariş"
              chart={
                <BarChart
                  ariaLabel="Saate göre sipariş sayısı"
                  data={report.hourly.map((h) => ({
                    label: String(h.hour).padStart(2, "0"),
                    title: `${String(h.hour).padStart(2, "0")}:00–${String(h.hour).padStart(2, "0")}:59`,
                    value: h.orders,
                  }))}
                  format={(v) => `${Math.round(v)} sipariş`}
                  axisFormat={(v) => String(Math.round(v))}
                  labelEvery={3}
                />
              }
              table={
                <Table head={["Saat", "Sipariş"]}>
                  {report.hourly
                    .filter((h) => h.orders > 0)
                    .map((h) => (
                      <tr key={h.hour}>
                        <Td>{String(h.hour).padStart(2, "0")}:00</Td>
                        <Td>{h.orders}</Td>
                      </tr>
                    ))}
                </Table>
              }
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Kurye performansı">
              <Table head={["Kurye", "Teslimat", "Ciro", "Ort. süre", "Puan"]} empty="Bu dönemde teslimat yok">
                {report.couriers.map((c) => (
                  <tr key={c.courierId ?? "-"}>
                    <Td>{c.name}</Td>
                    <Td>{c.delivered}</Td>
                    <Td className="whitespace-nowrap">{formatTL(c.revenueKurus)}</Td>
                    <Td>{minutes(c.avgDeliveryMin)}</Td>
                    <Td>{c.avgRating != null ? `★ ${c.avgRating.toLocaleString("tr-TR")}` : "—"}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title="En çok gönderi yapan müşteriler">
              <Table head={["Müşteri", "Teslimat", "Ciro"]} empty="Bu dönemde teslimat yok">
                {report.customers.map((c) => (
                  <tr key={c.customerId}>
                    <Td>
                      {c.name}
                      {c.phone ? <div className="text-xs text-slate-500">{c.phone}</div> : null}
                    </Td>
                    <Td>{c.delivered}</Td>
                    <Td className="whitespace-nowrap">{formatTL(c.revenueKurus)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>

          <Card title="Müşteri değerlendirmeleri" className="mt-6">
            <div className="grid gap-6 md:grid-cols-[260px_1fr]" data-testid="ratings">
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((n) => {
                  const c = report.ratingDist[n - 1] ?? 0;
                  const max = Math.max(1, ...report.ratingDist);
                  return (
                    <div key={n} className="flex items-center gap-2 text-sm">
                      <span className="w-8 text-slate-600">{n} ★</span>
                      <span className="h-3 flex-1 rounded-full bg-slate-100">
                        <span className="block h-3 rounded-full bg-brand" style={{ width: `${(c / max) * 100}%` }} />
                      </span>
                      <span className="w-8 text-right tabular-nums text-slate-700">{c}</span>
                    </div>
                  );
                })}
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-700">Düşük puanlar (3 ve altı)</div>
                {report.lowRatings.length === 0 ? <p className="text-sm text-slate-500">Bu dönemde düşük puan yok.</p> : null}
                <ul className="divide-y divide-slate-100">
                  {report.lowRatings.slice(0, 20).map((r) => (
                    <li key={r.orderId} className="py-2 text-sm">
                      <Link href={`/siparisler/${r.orderId}`} className="font-semibold text-brand hover:underline">
                        {r.orderNo}
                      </Link>{" "}
                      <span className="text-amber-600">{"★".repeat(r.score)}</span>
                      <span className="text-slate-500"> · {r.customerName ?? "Müşteri"}{r.courierName ? ` · kurye ${r.courierName}` : ""}</span>
                      {r.comment ? <div className="text-slate-700">“{r.comment}”</div> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
