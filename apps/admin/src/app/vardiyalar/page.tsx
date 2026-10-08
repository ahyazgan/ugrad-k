"use client";

import { useMemo, useState } from "react";
import { Button, Card, ErrorText, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { fmtDateTime, hoursBetween, istDate } from "@/lib/dates";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const fmtHours = (h: number) => `${Math.floor(h)} sa ${Math.round((h % 1) * 60)} dk`;

export default function VardiyalarPage() {
  const [from, setFrom] = useState(`${istDate().slice(0, 7)}-01`);
  const [to, setTo] = useState(istDate());
  const [courierId, setCourierId] = useState("");
  const couriers = useLoad(() => repo.listCouriers());
  const { data, error } = useLoad(() => repo.listShifts({ from, to, courierId: courierId || undefined }), [from, to, courierId]);

  const totals = useMemo(() => {
    const m = new Map<string, { name: string; plate: string | null; hours: number; days: Set<string>; count: number }>();
    for (const s of data ?? []) {
      const t = m.get(s.courierId) ?? { name: s.courierName ?? "", plate: s.plate, hours: 0, days: new Set(), count: 0 };
      t.hours += hoursBetween(s.startedAt, s.endedAt);
      t.days.add(istDate(s.startedAt));
      t.count++;
      m.set(s.courierId, t);
    }
    return [...m.values()];
  }, [data]);

  function exportCsv() {
    downloadCsv(`kurye_calisma_saatleri_${from}_${to}.csv`, [
      ["Kurye", "Telefon", "Plaka", "Başlangıç", "Bitiş", "Süre (saat)"],
      ...(data ?? []).map((s) => [
        s.courierName,
        s.courierPhone,
        s.plate,
        fmtDateTime(s.startedAt),
        s.endedAt ? fmtDateTime(s.endedAt) : "Devam ediyor",
        hoursBetween(s.startedAt, s.endedAt).toFixed(2).replace(".", ","),
      ]),
    ]);
  }

  return (
    <>
      <PageHeader
        title="Kurye çalışma saatleri"
        subtitle="BTK bildirimi için vardiya kayıtları. Kurye uygulamada vardiyayı başlatıp bitirdiğinde otomatik kaydedilir."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!data?.length}>
            CSV indir
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
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
      <Card title="Özet" className="mb-6">
        <Table head={["Kurye", "Plaka", "Çalışılan gün", "Vardiya", "Toplam süre"]}>
          {totals.map((t) => (
            <tr key={t.name}>
              <Td>{t.name}</Td>
              <Td>{t.plate}</Td>
              <Td>{t.days.size}</Td>
              <Td>{t.count}</Td>
              <Td className="font-semibold">{fmtHours(t.hours)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Table head={["Kurye", "Başlangıç", "Bitiş", "Süre"]} empty="Bu aralıkta vardiya kaydı yok">
        {(data ?? []).map((s) => (
          <tr key={s.id}>
            <Td>{s.courierName}</Td>
            <Td>{fmtDateTime(s.startedAt)}</Td>
            <Td>{s.endedAt ? fmtDateTime(s.endedAt) : <span className="font-semibold text-emerald-700">Devam ediyor</span>}</Td>
            <Td>{fmtHours(hoursBetween(s.startedAt, s.endedAt))}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
