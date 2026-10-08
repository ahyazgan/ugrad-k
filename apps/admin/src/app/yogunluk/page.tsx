"use client";

import {
  DEFAULT_ORDERS_PER_COURIER_HOUR,
  demandDataNote,
  demandHotspots,
  demandMatrix,
  staffingAdvice,
  uncoveredDemand,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  type Hotspot,
  type StaffingAdvice,
} from "@yazgan/shared";
import { useMemo, useState } from "react";
import { escapeHtml as esc, LeafletMap, type MapPin } from "@/components/LeafletMap";
import { Button, Card, ErrorText, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
// Sıralı tek ton (açık → koyu mavi); 0 = zemin
const RAMP = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
const ZERO = "#f1f5f9";
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const num = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
/** 0 → zemin; (0, max] → 5 eşit aralık */
const bin = (v: number, max: number) => (v <= 0 || max <= 0 ? -1 : Math.min(RAMP.length - 1, Math.ceil((v / max) * RAMP.length) - 1));
const fill = (v: number, max: number) => {
  const b = bin(v, max);
  return b < 0 ? ZERO : RAMP[b]!;
};

const VERDICT: Record<StaffingAdvice["verdict"], { label: string; cls: string }> = {
  artir: { label: "▲ Artır", cls: "font-semibold text-amber-700" },
  azalt: { label: "▼ Azalt", cls: "text-ink-soft" },
  uygun: { label: "✓ Uygun", cls: "text-emerald-700" },
};

export default function YogunlukPage() {
  const [weeks, setWeeks] = useState(8);
  const [day, setDay] = useState<number | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [hover, setHover] = useState<{ w: number; h: number } | null>(null);
  const [rate, setRate] = useState(String(DEFAULT_ORDERS_PER_COURIER_HOUR).replace(".", ","));
  const [msg, setMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error } = useLoad(() => repo.getDemand(weeks * 7), [weeks]);
  const plan = useLoad(() => repo.listShiftPlan(new Date().toISOString().slice(0, 10), 1));

  const matrix = useMemo(() => (data ? demandMatrix(data) : null), [data]);
  const max = matrix ? Math.max(0, ...matrix.flat()) : 0;
  const hotspots: Hotspot[] = useMemo(() => {
    if (!data) return [];
    const when = day == null && hour == null ? undefined : (w: number, h: number) => (day == null || w === day) && (hour == null || h === hour);
    return demandHotspots(data, { when, limit: 12 });
  }, [data, day, hour]);
  const rateNum = Number(rate.replace(",", "."));
  const advice = useMemo(
    () => (matrix && plan.data ? staffingAdvice(matrix, plan.data.templates, rateNum > 0 ? rateNum : DEFAULT_ORDERS_PER_COURIER_HOUR) : []),
    [matrix, plan.data, rateNum],
  );
  const uncovered = matrix && plan.data ? uncoveredDemand(matrix, plan.data.templates) : [];
  const note = data ? demandDataNote(data) : null;
  const total = data ? data.rows.reduce((s, r) => s + r.orders, 0) : 0;

  const pins: MapPin[] = hotspots.map((h, i) => ({
    id: `hot-${i}`,
    lat: h.lat,
    lng: h.lng,
    label: String(i + 1),
    // Beyaz sıra numarası okunsun: en açık iki ton işarette kullanılmaz
    color: RAMP[Math.max(2, bin(h.intensity, 1))]!,
    size: Math.round(22 + h.intensity * 18),
    front: i === 0,
    popup: `<b>${esc(h.district ?? "Bölge")}</b><br>Haftada ort. ${esc(num(h.perWeek))} sipariş<br>Payı %${Math.round(h.share * 100)}`,
  }));
  const filterLabel = day == null && hour == null ? "tüm gün ve saatler" : `${day ? WEEKDAY_LABELS[day] : "her gün"}${hour != null ? ` ${hh(hour)}–${hh(hour + 1)}` : ""}`;
  const shown = hover ?? (day != null && hour != null ? { w: day, h: hour } : null);

  async function apply(a: StaffingAdvice) {
    setMsg(null);
    setActionError(null);
    try {
      await repo.saveShiftTemplate(a.templateId, { required: a.suggested, active: true });
      setMsg(`${WEEKDAY_LABELS[a.weekday]} ${a.startTime}–${a.endTime}: gereken kurye ${a.suggested} yapıldı.`);
      await plan.reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Kaydedilemedi");
    }
  }

  return (
    <>
      <PageHeader
        title="Talep yoğunluğu"
        subtitle="Geçmiş siparişlerin alış zamanı ve yeri (~1 km hücre, iptaller hariç). Hangi gün/saatte nerede kurye bulundurmalı, vardiya planında kaç kurye gerekir? Kuryeler uygulamada önümüzdeki saatin yoğun bölgelerini görür."
        actions={
          <Select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="Dönem" data-testid="demand-weeks">
            <option value={4}>Son 4 hafta</option>
            <option value={8}>Son 8 hafta</option>
            <option value={12}>Son 12 hafta</option>
            <option value={26}>Son 6 ay</option>
          </Select>
        }
      />
      <ErrorText>{error ?? plan.error ?? actionError}</ErrorText>
      {note ? <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="demand-note">{note}</p> : null}
      {msg ? <p className="mb-3 text-sm text-emerald-700" data-testid="demand-msg">{msg}</p> : null}

      <Card
        title="Hafta günü × saat"
        className="mb-6"
        actions={
          day != null || hour != null ? (
            <Button
              variant="ghost"
              onClick={() => {
                setDay(null);
                setHour(null);
              }}
              data-testid="demand-clear"
            >
              Seçimi temizle
            </Button>
          ) : null
        }
      >
        <p className="mb-2 min-h-5 text-sm text-ink-soft" data-testid="demand-hover">
          {shown && matrix
            ? `${WEEKDAY_LABELS[shown.w]} ${hh(shown.h)}–${hh(shown.h + 1)} · haftada ort. ${num(matrix[shown.w - 1]![shown.h]!)} sipariş`
            : `${total} sipariş, ${data ? num(data.weeks) : "–"} hafta. Bir hücreye tıklayınca harita o gün ve saate süzülür.`}
        </p>
        <div className="overflow-x-auto">
          <table className="border-separate" style={{ borderSpacing: 2 }} data-testid="demand-matrix">
            <thead>
              <tr>
                <th />
                {HOURS.map((h) => (
                  <th key={h} className="w-6 text-center text-[10px] font-normal text-muted">
                    {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((w) => (
                <tr key={w}>
                  <th className="pr-2 text-left text-xs font-medium text-ink-soft">
                    <button
                      className={day === w ? "text-brand underline" : ""}
                      onClick={() => {
                        setDay(day === w && hour == null ? null : w);
                        setHour(null);
                      }}
                    >
                      {WEEKDAY_SHORT[w]}
                    </button>
                  </th>
                  {HOURS.map((h) => {
                    const v = matrix?.[w - 1]![h] ?? 0;
                    const selected = (day == null || day === w) && (hour == null || hour === h) && (day != null || hour != null);
                    return (
                      <td key={h} className="p-0">
                        <button
                          aria-label={`${WEEKDAY_LABELS[w]} ${hh(h)}: haftada ort. ${num(v)} sipariş`}
                          title={`${WEEKDAY_LABELS[w]} ${hh(h)} · ${num(v)}`}
                          data-testid={`demand-cell-${w}-${h}`}
                          onMouseEnter={() => setHover({ w, h })}
                          onMouseLeave={() => setHover(null)}
                          onFocus={() => setHover({ w, h })}
                          onBlur={() => setHover(null)}
                          onClick={() => {
                            setDay(w);
                            setHour(h);
                          }}
                          className={`block h-6 w-6 rounded-[4px] ${selected ? "ring-2 ring-amber-500 ring-offset-1" : ""}`}
                          style={{ background: fill(v, max) }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft" aria-hidden>
          <span>Haftalık ortalama sipariş:</span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-4 rounded-sm border border-line" style={{ background: ZERO }} /> 0
          </span>
          {RAMP.map((c, i) => (
            <span key={c} className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-4 rounded-sm" style={{ background: c }} />
              {num((max * i) / RAMP.length)}–{num((max * (i + 1)) / RAMP.length)}
            </span>
          ))}
        </div>
      </Card>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card title={`Sıcak bölgeler · ${filterLabel}`} className="xl:col-span-2">
          <LeafletMap pins={pins} fitKey={`${weeks}-${day}-${hour}-${hotspots.length}`} className="h-[420px] w-full rounded-lg" />
        </Card>
        <Card title="Sıralama">
          <Table head={["#", "Bölge", "Haftada", "Pay"]} num={[2, 3]} empty="Bu seçimde sipariş yok. Başka bir gün/saat hücresi seçin veya seçimi temizleyin.">
            {hotspots.map((h, i) => (
              <tr key={`${h.lat}-${h.lng}`} data-testid="hotspot-row">
                <Td>{i + 1}</Td>
                <Td>{h.district ?? "Bölge"}</Td>
                <Td num>{num(h.perWeek)}</Td>
                <Td num>%{Math.round(h.share * 100)}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-muted">Hücre ~1 km; ilçe, hücredeki alış adreslerinde en sık geçen ilçedir.</p>
        </Card>
      </div>

      <Card title="Vardiya önerisi">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Input label="Kurye başına saatlik iş" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} data-testid="demand-rate" />
          </div>
          <p className="max-w-xl text-xs text-muted">
            Öneri = dilimin en yoğun saatindeki haftalık ortalama sipariş ÷ kurye başına saatlik iş (yukarı yuvarlanır; talep varsa en az 1).
            Ortalama teslim ~1 saat sürdüğünden 1–1,5 makuldür. <b>Uygula</b> vardiya planındaki gereken kurye sayısını değiştirir.
          </p>
        </div>
        <Table head={["Gün", "Dilim", "Planlanan", "En yoğun saat", "Öneri", ""]} empty="Etkin vardiya dilimi yok">
          {advice.map((a) => (
            <tr key={a.templateId} data-testid={`advice-${a.templateId}`}>
              <Td>{WEEKDAY_LABELS[a.weekday]}</Td>
              <Td className="whitespace-nowrap">
                {a.startTime}–{a.endTime}
              </Td>
              <Td>{a.required}</Td>
              <Td className="whitespace-nowrap">{num(a.peakPerHour)} sipariş</Td>
              <Td className="whitespace-nowrap">
                {a.suggested} <span className={`ml-1 text-xs ${VERDICT[a.verdict].cls}`}>{VERDICT[a.verdict].label}</span>
              </Td>
              <Td className="text-right">
                {a.verdict !== "uygun" ? (
                  <Button variant="secondary" onClick={() => apply(a)} data-testid={`apply-${a.templateId}`}>
                    Uygula
                  </Button>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
        {uncovered.length ? (
          <p className="mt-3 text-sm text-amber-800" data-testid="demand-uncovered">
            Vardiya dilimi olmayan ama talep gelen saatler:{" "}
            {uncovered
              .slice(0, 12)
              .map((u) => `${WEEKDAY_SHORT[u.weekday]} ${hh(u.hour)} (${num(u.perWeek)})`)
              .join(", ")}
            {uncovered.length > 12 ? ` ve ${uncovered.length - 12} saat daha` : ""}. Vardiya planında dilim açmayı düşünün.
          </p>
        ) : null}
      </Card>
    </>
  );
}
