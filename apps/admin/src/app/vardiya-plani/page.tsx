"use client";

import { ATTENDANCE_LABELS, attendance, coverageState, WEEKDAY_LABELS, type AttendanceStatus } from "@yazgan/shared";
import { useMemo, useState } from "react";
import { Button, Card, ErrorText, PageHeader, Select } from "@/components/ui";
import { istDate } from "@/lib/dates";
import { repo, type ShiftBooking, type ShiftTemplate } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

/** Haftanın pazartesisi (İstanbul günü) */
function mondayOf(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
}
const addDays = (day: string, n: number) => new Date(new Date(`${day}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

const COVER: Record<string, string> = {
  tamam: "bg-emerald-50 border-emerald-200",
  eksik: "bg-amber-50 border-amber-300",
  bos: "bg-red-50 border-red-300",
  gereksiz: "bg-canvas border-line",
};
const ATT: Record<AttendanceStatus, string> = {
  bekliyor: "text-muted",
  geldi: "text-emerald-700",
  gelmedi: "font-semibold text-red-700",
  iptal: "text-slate-400 line-through",
  gec_iptal: "text-red-600 line-through",
};

export default function VardiyaPlaniPage() {
  const [week, setWeek] = useState(() => mondayOf(istDate()));
  const [addFor, setAddFor] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, error, reload } = useLoad(async () => {
    const [plan, couriers, shifts] = await Promise.all([
      repo.listShiftPlan(week, 7),
      repo.listCouriers(),
      repo.listShifts({ from: week, to: addDays(week, 6) }),
    ]);
    return { ...plan, couriers: couriers.filter((c) => c.active), shifts, now: Date.now() };
  }, [week]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const rows = useMemo(() => {
    const keys = new Map<string, { start: string; end: string }>();
    for (const t of data?.templates ?? []) if (t.active) keys.set(`${t.startTime}-${t.endTime}`, { start: t.startTime, end: t.endTime });
    return [...keys.values()].sort((a, b) => a.start.localeCompare(b.start));
  }, [data]);

  const cell = (day: string, row: { start: string; end: string }) => {
    const weekday = ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const t = data?.templates.find((x) => x.active && x.weekday === weekday && x.startTime === row.start && x.endTime === row.end);
    if (!t) return null;
    const bookings = (data?.bookings ?? []).filter((b) => b.templateId === t.id && istDate(b.startsAt) === day);
    return { t, bookings };
  };

  const statusOf = (b: ShiftBooking) =>
    attendance(
      b,
      (data?.shifts ?? []).filter((s) => s.courierId === b.courierId).map((s) => ({ startedAt: s.startedAt, endedAt: s.endedAt })),
      new Date(data?.now ?? 0),
    ).status;

  let missing = 0;
  for (const d of days) for (const r of rows) {
    const c = cell(d, r);
    if (c) missing += coverageState({ required: c.t.required, booked: c.bookings.filter((b) => !b.cancelledAt).length }).missing;
  }

  async function act(fn: () => Promise<void>) {
    setActionError(null);
    try {
      await fn();
      setAddFor(null);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "İşlem başarısız");
    }
  }

  return (
    <>
      <PageHeader
        title="Vardiya planı"
        subtitle="Kuryeler önümüzdeki 14 günün dilimlerinden uygulamadan vardiya seçer. Eksik dilimlere siz de kurye atayabilirsiniz; 1 saat önce hatırlatma, gelmeyen için size uyarı gider."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setWeek(addDays(week, -7))}>
              ← Önceki
            </Button>
            <Button variant="secondary" onClick={() => setWeek(mondayOf(istDate()))}>
              Bu hafta
            </Button>
            <Button variant="secondary" onClick={() => setWeek(addDays(week, 7))} data-testid="next-week">
              Sonraki →
            </Button>
          </div>
        }
      />
      <ErrorText>{error ?? actionError}</ErrorText>
      <p className="mb-3 text-sm" data-testid="plan-summary">
        {new Date(`${week}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "UTC" })} haftası ·{" "}
        {missing ? <b className="text-red-700">{missing} kurye-dilim eksik</b> : <b className="text-emerald-700">tüm dilimler dolu</b>}
      </p>
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="min-w-[900px] w-full table-fixed text-xs">
          <thead>
            <tr>
              <th className="w-24 p-2 text-left text-muted">Saat</th>
              {days.map((d) => (
                <th key={d} className="p-2 text-left text-slate-700">
                  {WEEKDAY_LABELS[((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1]}
                  <span className="block font-normal text-muted">{d.slice(8)}.{d.slice(5, 7)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.start}-${r.end}`} className="align-top">
                <td className="p-2 font-semibold text-slate-700">
                  {r.start}–{r.end}
                </td>
                {days.map((d) => {
                  const c = cell(d, r);
                  if (!c) return <td key={d} className="p-1" />;
                  const active = c.bookings.filter((b) => !b.cancelledAt);
                  const cov = coverageState({ required: c.t.required, booked: active.length });
                  const key = `${d}|${c.t.id}`;
                  return (
                    <td key={d} className="p-1">
                      <div className={`min-h-16 rounded-lg border p-1.5 ${COVER[cov.state]}`} data-testid={`cell-${d}-${r.start}`}>
                        <div className="mb-1 font-semibold text-slate-700">
                          {active.length}/{c.t.required}
                        </div>
                        {c.bookings.map((b) => {
                          const st = statusOf(b);
                          return (
                            <div key={b.id} className="flex items-center justify-between gap-1">
                              <span className={ATT[st]} title={ATTENDANCE_LABELS[st]}>
                                {b.courierName ?? "Kurye"}
                                {st !== "bekliyor" ? ` · ${ATTENDANCE_LABELS[st].toLocaleLowerCase("tr-TR")}` : ""}
                              </span>
                              {!b.cancelledAt && new Date(b.endsAt).getTime() > (data?.now ?? 0) ? (
                                <button className="text-slate-400 hover:text-red-700" title="Kaldır" onClick={() => act(() => repo.cancelShiftBooking(b.id))}>
                                  ×
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                        {addFor === key ? (
                          <Select
                            label=""
                            value=""
                            data-testid="add-courier"
                            onChange={(e) => e.target.value && act(() => repo.bookShiftFor(c.t.id, d, e.target.value))}
                          >
                            <option value="">Kurye seç…</option>
                            {(data?.couriers ?? [])
                              .filter((k) => !active.some((b) => b.courierId === k.id))
                              .map((k) => (
                                <option key={k.id} value={k.id}>
                                  {k.fullName}
                                </option>
                              ))}
                          </Select>
                        ) : new Date(`${d}T${r.end === "24:00" ? "23:59" : r.end}:00+03:00`).getTime() > (data?.now ?? 0) ? (
                          <button className="mt-1 text-brand hover:underline" onClick={() => setAddFor(key)} data-testid={`add-${d}-${r.start}`}>
                            + kurye
                          </button>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Yeşil: dolu · sarı: eksik · kırmızı: boş. Geçmiş dilimlerde gerçek vardiya kaydına göre &quot;geldi / gelmedi&quot;; 2 saatten az kala bırakılan &quot;geç iptal&quot;.
      </p>
      {data ? <TemplateEditor templates={data.templates} onSaved={reload} /> : null}
    </>
  );
}

/** Haftalık şablon: gün × dilim başına gereken kurye */
function TemplateEditor({ templates, onSaved }: { templates: ShiftTemplate[]; onSaved: () => void }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(templates.map((t) => [t.id, String(t.required)])));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setMsg(null);
    setErr(null);
    try {
      for (const t of templates) {
        const n = Number(draft[t.id]);
        if (!Number.isInteger(n) || n < 0 || n > 50) throw new Error(`${WEEKDAY_LABELS[t.weekday]} ${t.startTime}: 0–50 arası tam sayı girin`);
        if (n !== t.required) await repo.saveShiftTemplate(t.id, { required: n, active: t.active });
      }
      setMsg("Kaydedildi");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Kaydedilemedi");
    }
  }

  return (
    <Card title="Haftalık şablon: gereken kurye sayısı" className="mt-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <div key={d}>
            <div className="mb-1 text-sm font-semibold text-slate-700">{WEEKDAY_LABELS[d]}</div>
            {templates
              .filter((t) => t.weekday === d)
              .map((t) => (
                <label key={t.id} className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-600">
                    {t.startTime}–{t.endTime}
                  </span>
                  <input
                    className="w-16 rounded border border-line px-2 py-1 text-right"
                    inputMode="numeric"
                    value={draft[t.id] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [t.id]: e.target.value })}
                    data-testid={`req-${t.id}`}
                  />
                </label>
              ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={save}>Kaydet</Button>
        <ErrorText>{err}</ErrorText>
        {msg ? <span className="text-sm text-emerald-700">{msg}</span> : null}
      </div>
    </Card>
  );
}
