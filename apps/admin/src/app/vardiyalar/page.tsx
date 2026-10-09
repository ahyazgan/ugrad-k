"use client";

import { useMemo, useState } from "react";
import { Button, Card, ErrorText, Input, PageHeader, Select, Stat, Table, Td } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { fmtDateTime, hoursBetween, istDate } from "@/lib/dates";
import { repo, type Shift } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const fmtHours = (h: number) => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)} sa ${m % 60} dk`;
};
/** Vardiyadaki toplam mola (saat); açık mola şimdiye kadar */
const breakHours = (s: Shift) => s.breaks.reduce((t, b) => t + hoursBetween(b.startedAt, b.endedAt), 0);

export default function VardiyalarPage() {
  const [from, setFrom] = useState(`${istDate().slice(0, 7)}-01`);
  const [to, setTo] = useState(istDate());
  const [courierId, setCourierId] = useState("");
  const couriers = useLoad(() => repo.listCouriers());
  const { data, error } = useLoad(() => repo.listShifts({ from, to, courierId: courierId || undefined }), [from, to, courierId]);

  const totals = useMemo(() => {
    const m = new Map<string, { name: string; plate: string | null; hours: number; breakHours: number; days: Set<string>; count: number }>();
    for (const s of data ?? []) {
      const t = m.get(s.courierId) ?? { name: s.courierName ?? "", plate: s.plate, hours: 0, breakHours: 0, days: new Set(), count: 0 };
      t.hours += hoursBetween(s.startedAt, s.endedAt);
      t.breakHours += breakHours(s);
      t.days.add(istDate(s.startedAt));
      t.count++;
      m.set(s.courierId, t);
    }
    return [...m.values()];
  }, [data]);
  const kpi = useMemo(() => {
    const list = data ?? [];
    const net = list.reduce((t, s) => t + hoursBetween(s.startedAt, s.endedAt) - breakHours(s), 0);
    const closed = list.filter((s) => s.endedAt);
    const avg = closed.length ? closed.reduce((t, s) => t + hoursBetween(s.startedAt, s.endedAt) - breakHours(s), 0) / closed.length : null;
    return { net, avg, closedCount: closed.length };
  }, [data]);
  // "Now on shift" is independent of the date filter
  const onShift = (couriers.data ?? []).filter((c) => c.active && c.isOnShift);

  function exportCsv() {
    downloadCsv(`kurye_calisma_saatleri_${from}_${to}.csv`, [
      ["Kurye", "Telefon", "Plaka", "Başlangıç", "Bitiş", "Süre (saat)", "Mola (saat)", "Net çalışma (saat)"],
      ...(data ?? []).map((s) => [
        s.courierName,
        s.courierPhone,
        s.plate,
        fmtDateTime(s.startedAt),
        s.endedAt ? fmtDateTime(s.endedAt) : "Devam ediyor",
        hoursBetween(s.startedAt, s.endedAt).toFixed(2).replace(".", ","),
        breakHours(s).toFixed(2).replace(".", ","),
        (hoursBetween(s.startedAt, s.endedAt) - breakHours(s)).toFixed(2).replace(".", ","),
      ]),
    ]);
  }

  return (
    <>
      <PageHeader
        title="Kurye çalışma saatleri"
        subtitle="BTK bildirimi için vardiya ve mola kayıtları. Kurye uygulamada vardiyayı başlatıp bitirdiğinde ve mola verdiğinde otomatik kaydedilir."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!data?.length}>
            CSV indir
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Net çalışma (seçili aralık)" value={data ? fmtHours(kpi.net) : "…"} hint="Molalar düşülmüş" />
        <Stat label="Ortalama vardiya" value={data ? (kpi.avg == null ? "—" : fmtHours(kpi.avg)) : "…"} hint={data ? `${kpi.closedCount} tamamlanan vardiya, net` : undefined} />
        <Stat
          label="Şu an vardiyada"
          value={couriers.data ? onShift.length : "…"}
          hint={couriers.data ? (onShift.length ? onShift.map((c) => c.fullName).join(", ") : "Kimse vardiyada değil") : undefined}
        />
      </div>
      <div className="mb-4 grid gap-3 rounded-card border border-line bg-white p-4 sm:grid-cols-3">
        <Input label="Başlangıç" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Bitiş" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select label="Kurye" value={courierId} onChange={(e) => setCourierId(e.target.value)}>
          <option value="">Tümü</option>
          {(couriers.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
        </Select>
      </div>
      <ErrorText>{error}</ErrorText>
      <Card title="Kurye bazında özet" className="mb-6">
        <Table head={["Kurye", "Plaka", "Çalışılan gün", "Vardiya", "Toplam süre", "Mola", "Net çalışma"]} num={[2, 3, 4, 5, 6]} empty="Bu aralıkta vardiya kaydı yok. Tarih aralığını genişletin.">
          {totals.map((t) => (
            <tr key={t.name}>
              <Td>{t.name}</Td>
              <Td>{t.plate}</Td>
              <Td num>{t.days.size}</Td>
              <Td num>{t.count}</Td>
              <Td num>{fmtHours(t.hours)}</Td>
              <Td num>{fmtHours(t.breakHours)}</Td>
              <Td num className="font-semibold">
                <span data-testid="net-hours">{fmtHours(t.hours - t.breakHours)}</span>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title={`Vardiya kayıtları${data ? ` · ${data.length}` : ""}`}>
      <Table head={["Kurye", "Başlangıç", "Bitiş", "Süre", "Mola"]} num={[3]} empty="Bu aralıkta vardiya kaydı yok. Kuryeler uygulamada vardiya başlattıkça kayıtlar burada birikir.">
        {[...(data ?? [])].sort((x, y) => y.startedAt.localeCompare(x.startedAt)).map((s) => (
          <tr key={s.id}>
            <Td>{s.courierName}</Td>
            <Td>{fmtDateTime(s.startedAt)}</Td>
            <Td>{s.endedAt ? fmtDateTime(s.endedAt) : <span className="font-semibold text-emerald-700">Devam ediyor</span>}</Td>
            <Td num>{fmtHours(hoursBetween(s.startedAt, s.endedAt))}</Td>
            <Td>
              {s.breaks.length ? fmtHours(breakHours(s)) : "—"}
              {s.breaks.some((b) => b.auto) ? <span className="ml-1 text-xs text-amber-700">(otomatik)</span> : null}
              {s.breaks.some((b) => !b.endedAt) ? <span className="ml-1 text-xs font-semibold text-amber-700">molada</span> : null}
            </Td>
          </tr>
        ))}
      </Table>
      </Card>
    </>
  );
}
