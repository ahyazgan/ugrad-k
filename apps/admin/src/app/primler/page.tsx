"use client";

import { formatTL, INCENTIVE_PERIODS, incentiveProblem, incentiveScope, istanbulDay, WEEKDAY_SHORT, type Incentive } from "@yazgan/shared";
import { useState, type FormEvent } from "react";
import { Button, Card, ErrorText, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { repo, type CourierIncentive } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const HOURS = Array.from({ length: 25 }, (_, h) => h);
const tlToKurus = (s: string) => Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100);
const fmtDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const emptyForm = () => ({
  title: "",
  kind: "hedef" as Incentive["kind"],
  period: "gunluk" as Incentive["period"],
  tiers: [
    { target: "", reward: "" },
    { target: "", reward: "" },
  ],
  bonusPct: "",
  days: DAYS,
  startHour: 0,
  endHour: 24,
  startsOn: istanbulDay(),
  endsOn: "",
});

/** Kampanyanın ödül kuralı; hedefte her kademe ayrı satır */
function ruleLines(i: Incentive): string[] {
  if (i.kind === "yuzde") return [`Hakedişe +%${(i.bonusPct ?? 0).toLocaleString("tr-TR")}`];
  return i.tiers.map((t) => `${t.target} iş → ${formatTL(t.rewardKurus)}`);
}

export default function PrimlerPage() {
  const { data, error, reload } = useLoad(async () => {
    const [incentives, awards] = await Promise.all([repo.listIncentives(), repo.listIncentiveAwards({})]);
    return { incentives, awards };
  });
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setMsg(null);
    const tiers = form.tiers
      .filter((t) => t.target.trim() || t.reward.trim())
      .map((t) => ({ target: Number(t.target), rewardKurus: tlToKurus(t.reward) }));
    const incentive: Incentive = {
      title: form.title.trim(),
      kind: form.kind,
      period: form.period,
      tiers: form.kind === "hedef" ? tiers : [],
      bonusPct: form.kind === "yuzde" ? Number(form.bonusPct.replace(",", ".")) : null,
      weekdays: form.days.length === 7 ? null : form.days,
      startHour: form.startHour,
      endHour: form.endHour,
      startsOn: form.startsOn,
      endsOn: form.endsOn || null,
    };
    const problem = incentiveProblem(incentive);
    if (problem) return setFormError(problem);
    try {
      await repo.createIncentive(incentive);
      setForm(emptyForm());
      setMsg(`"${incentive.title}" başladı.`);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Kaydedilemedi");
    }
  }

  const toggleDay = (d: number) =>
    setForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort((a, b) => a - b) }));
  const setTier = (k: number, patch: Partial<{ target: string; reward: string }>) =>
    setForm((f) => ({ ...f, tiers: f.tiers.map((t, j) => (j === k ? { ...t, ...patch } : t)) }));

  const unpaid = (data?.awards ?? []).filter((a) => !a.payoutId);

  return (
    <>
      <PageHeader
        title="Kurye primleri"
        subtitle="Hedef primi (gün/hafta içinde N iş → ödül, kademeli) veya seçili gün ve saatlerde hakedişe yüzde ek. Ödül dönem kapanınca otomatik hesaplanır, kuryenin hesaplaşmasına eklenir; kurye ilerlemesini uygulamada görür."
      />
      <ErrorText>{error}</ErrorText>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Kampanyalar">
            <Table head={["Kampanya", "Ödül", "Kapsam", "Tarih", "Durum", ""]} empty="Henüz prim kampanyası yok. Sağdaki formdan ilk hedefi tanımlayın.">
              {(data?.incentives ?? []).map((i: CourierIncentive) => (
                <tr key={i.id} className={i.active ? "" : "opacity-50"} data-testid={`incentive-${i.id}`}>
                  <Td>
                    <div className="font-semibold">{i.title}</div>
                    <div className="text-xs text-muted">{INCENTIVE_PERIODS[i.period]}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-sm">
                    {ruleLines(i).map((l) => (
                      <div key={l}>{l}</div>
                    ))}
                  </Td>
                  <Td className="whitespace-nowrap text-sm">{incentiveScope(i)}</Td>
                  <Td className="whitespace-nowrap text-xs text-ink-soft">
                    {fmtDay(i.startsOn)}
                    {i.endsOn ? ` – ${fmtDay(i.endsOn)}` : " – süresiz"}
                  </Td>
                  <Td>{i.active ? <span className="font-semibold text-emerald-700">Açık</span> : "Kapalı"}</Td>
                  <Td>
                    <Button variant="ghost" onClick={() => repo.setIncentiveActive(i.id, !i.active).then(reload)}>
                      {i.active ? "Durdur" : "Aç"}
                    </Button>
                  </Td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-xs text-muted">
              Durdurulan kampanyanın kapanmamış dönemi için ödül yazılmaz; daha önce kazanılan primler hesaplaşmada kalır.
            </p>
          </Card>

          <Card title={`Kazanılan primler${unpaid.length ? ` · ödenmemiş ${formatTL(unpaid.reduce((t, a) => t + a.amountKurus, 0))}` : ""}`}>
            <div className="max-h-96 overflow-y-auto">
              <Table head={["Dönem", "Kurye", "Kampanya", "Gerçekleşen", "Prim", "Durum"]} num={[4]} empty="Henüz kazanılan prim yok. Dönem kapanınca hedefe ulaşan kuryelerin primi otomatik hesaplanır.">
                {(data?.awards ?? []).map((a) => (
                  <tr key={a.id} data-testid="incentive-award">
                    <Td className="whitespace-nowrap">
                      {fmtDay(a.periodStart)}
                      {a.periodEnd !== a.periodStart ? ` – ${fmtDay(a.periodEnd)}` : ""}
                    </Td>
                    <Td>{a.courierName ?? "Kurye"}</Td>
                    <Td className="text-sm">{a.incentiveTitle}</Td>
                    <Td className="text-sm">{a.detail ?? `${a.achieved} iş`}</Td>
                    <Td num className="font-semibold">{formatTL(a.amountKurus)}</Td>
                    <Td className="text-sm">{a.payoutId ? "Hesaplaşıldı" : <span className="text-amber-700">Ödenecek</span>}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          </Card>
        </div>

        <Card title="Yeni prim kampanyası">
          <form onSubmit={create} className="space-y-3">
            <Input
              label="Başlık (kurye görür)"
              placeholder="Örn. Hafta sonu hedefi"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              data-testid="incentive-title"
              required
            />
            <div className="grid grid-cols-2 gap-2">
              <Select label="Tür" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Incentive["kind"] })} data-testid="incentive-kind">
                <option value="hedef">Hedef (iş sayısı)</option>
                <option value="yuzde">Yüzde ek</option>
              </Select>
              <Select label="Dönem" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as Incentive["period"] })}>
                <option value="gunluk">Günlük</option>
                <option value="haftalik">Haftalık (Pzt–Paz)</option>
              </Select>
            </div>
            {form.kind === "hedef" ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-slate-700">Kademeler (ulaşılan en yüksek kademe ödenir)</div>
                {form.tiers.map((t, k) => (
                  <div key={k} className="grid grid-cols-2 gap-2">
                    <Input placeholder="İş sayısı" inputMode="numeric" value={t.target} onChange={(e) => setTier(k, { target: e.target.value })} data-testid={`tier-target-${k}`} />
                    <Input placeholder="Ödül (TL)" inputMode="decimal" value={t.reward} onChange={(e) => setTier(k, { reward: e.target.value })} data-testid={`tier-reward-${k}`} />
                  </div>
                ))}
                {form.tiers.length < 5 ? (
                  <Button type="button" variant="ghost" onClick={() => setForm({ ...form, tiers: [...form.tiers, { target: "", reward: "" }] })}>
                    + Kademe ekle
                  </Button>
                ) : null}
              </div>
            ) : (
              <Input
                label="Hakedişe ek (%)"
                inputMode="decimal"
                placeholder="Örn. 20"
                value={form.bonusPct}
                onChange={(e) => setForm({ ...form, bonusPct: e.target.value })}
                data-testid="incentive-pct"
              />
            )}
            <div>
              <div className="mb-1 text-sm font-medium text-slate-700">Günler</div>
              <div className="flex flex-wrap gap-1">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    data-testid={`incentive-day-${d}`}
                    className={`rounded-md border px-2 py-1 text-sm ${form.days.includes(d) ? "border-brand bg-brand text-white" : "border-line text-ink-soft"}`}
                  >
                    {WEEKDAY_SHORT[d]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Başlangıç saati" value={form.startHour} onChange={(e) => setForm({ ...form, startHour: Number(e.target.value) })}>
                {HOURS.slice(0, 24).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
              <Select label="Bitiş saati" value={form.endHour} onChange={(e) => setForm({ ...form, endHour: Number(e.target.value) })}>
                {HOURS.slice(1).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Başlangıç günü" type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} required />
              <Input label="Bitiş günü (isteğe bağlı)" type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
            </div>
            <p className="text-xs text-muted">
              Yalnız seçili gün ve saatlerde tamamlanan işler sayılır (İstanbul saati). İade edilen iş de tamamlanmış sayılır. Örnek: yağmurlu
              günde 16:00–20:00 arasına %25 ek; hafta sonu 15 iş → 300 TL.
            </p>
            <ErrorText>{formError}</ErrorText>
            {msg ? <p className="text-sm text-emerald-700" data-testid="incentive-msg">{msg}</p> : null}
            <Button type="submit" className="w-full" data-testid="create-incentive">
              Kampanyayı başlat
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
