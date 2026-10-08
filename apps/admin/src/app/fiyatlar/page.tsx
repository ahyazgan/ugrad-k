"use client";

import { calculatePrice, formatTL, type Holiday, type PricingSettings } from "@yazgan/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Card, ErrorText, Input, PageHeader, Table, Td } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

type Kind = "tl" | "pct" | "int" | "kg" | "hour";
const FIELDS: Array<{ key: keyof PricingSettings; label: string; kind: Kind; hint?: string }> = [
  { key: "baseFeeKurus", label: "Açılış ücreti", kind: "tl" },
  { key: "includedKm", label: "Açılışa dahil km", kind: "int" },
  { key: "perKmKurus", label: "Ek km ücreti", kind: "tl" },
  { key: "urgentSurchargePct", label: "Acil ek ücreti", kind: "pct" },
  { key: "nightHolidaySurchargePct", label: "Gece / resmi tatil ek ücreti", kind: "pct" },
  { key: "nightStartHour", label: "Gece başlangıç saati", kind: "hour" },
  { key: "nightEndHour", label: "Gece bitiş saati", kind: "hour" },
  { key: "halfDayStartHour", label: "Arife tatil başlangıç saati", kind: "hour" },
  { key: "waitingFreeMinutes", label: "Ücretsiz bekleme (dk)", kind: "int" },
  { key: "waitingBlockMinutes", label: "Bekleme dilimi (dk)", kind: "int" },
  { key: "waitingBlockFeeKurus", label: "Dilim başı bekleme ücreti", kind: "tl" },
  { key: "returnLegDiscountPct", label: "Dönüş ayağı indirimi", kind: "pct" },
  { key: "heavyThresholdKg", label: "Ağır paket eşiği (kg)", kind: "kg" },
  { key: "heavySurchargeKurus", label: "Ağır / büyük paket ücreti", kind: "tl" },
  { key: "bridgeFeeKurus", label: "Köprü geçiş ücreti", kind: "tl", hint: "Avrupa yakasına giden/gelen siparişe 1 kez" },
  { key: "vatPct", label: "KDV", kind: "pct" },
];

const toInput = (v: number, kind: Kind) => (kind === "tl" ? (v / 100).toString().replace(".", ",") : String(v));
const fromInput = (s: string, kind: Kind) => {
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  if (kind === "tl") return Math.round(n * 100);
  if (kind === "hour") return n <= 23 && Number.isInteger(n) ? n : null;
  if (kind === "int") return Number.isInteger(n) ? n : null;
  return n;
};

const SCENARIOS = [
  { label: "5 km standart (gündüz)", input: { distanceMeters: 5_000 } },
  { label: "12 km acil", input: { distanceMeters: 12_000, urgent: true } },
  { label: "8 km gece", input: { distanceMeters: 8_000, night: true } },
  { label: "22 km köprü geçişli", input: { distanceMeters: 22_000, bridgeCrossings: 1 } },
  { label: "6 km gidiş-dönüş, 12 kg", input: { distanceMeters: 6_000, roundTrip: true, weightKg: 12 } },
  { label: "4 km, 32 dk bekleme", input: { distanceMeters: 4_000, waitingMinutes: 32 } },
];
const DAY = new Date("2026-10-07T11:00:00Z"); // Çarşamba 14:00 İstanbul
const NIGHT = new Date("2026-10-07T20:30:00Z"); // 23:30 İstanbul

export default function FiyatlarPage() {
  const { data, error, reload } = useLoad(() => repo.getPricing());
  const [values, setValues] = useState<Record<string, string>>({});
  const [tiers, setTiers] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [holiday, setHoliday] = useState<Holiday>({ date: "", name: "", halfDay: false });

  useEffect(() => {
    if (!data) return;
    setValues(Object.fromEntries(FIELDS.map((f) => [f.key, toInput(data.settings[f.key] as number, f.kind)])));
    setTiers(data.settings.corporateTiers.map((t) => `${t.minDeliveries}:${t.discountPct}`).join(", "));
  }, [data]);

  // Formdaki değerlerden ayar nesnesi (geçersiz alan varsa hatalarla)
  const draft = useMemo(() => {
    if (!data) return null;
    const errors: string[] = [];
    const s: PricingSettings = { ...data.settings };
    for (const f of FIELDS) {
      const v = fromInput(values[f.key] ?? "", f.kind);
      if (v == null) errors.push(f.label);
      else (s[f.key] as number) = v;
    }
    const parsed = tiers
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => x.split(":").map((n) => Number(n.trim())));
    if (parsed.some((p) => p.length !== 2 || p.some((n) => !Number.isFinite(n) || n < 0))) errors.push("Kurumsal kademeler");
    else s.corporateTiers = parsed.map(([minDeliveries, discountPct]) => ({ minDeliveries: minDeliveries!, discountPct: discountPct! }));
    if (s.waitingBlockMinutes <= 0) errors.push("Bekleme dilimi");
    return { settings: s, errors };
  }, [data, values, tiers]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || draft.errors.length) return;
    setSaveError(null);
    setSaveMsg(null);
    try {
      await repo.savePricing(draft.settings);
      setSaveMsg("Kaydedildi. Yeni siparişler bu tarifeyle hesaplanır.");
      await reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Kaydedilemedi");
    }
  }

  async function addHoliday(e: FormEvent) {
    e.preventDefault();
    await repo.addHoliday({ ...holiday, name: holiday.name.trim() });
    setHoliday({ date: "", name: "", halfDay: false });
    await reload();
  }

  const upcoming = (data?.holidays ?? []).filter((h) => h.date >= new Date().toISOString().slice(0, 10));

  return (
    <>
      <PageHeader
        title="Fiyatlar"
        subtitle={`Tüm tutarlar KDV hariç. Son güncelleme: ${fmtDateTime(data?.updatedAt ?? null)}`}
      />
      <ErrorText>{error}</ErrorText>
      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Tarife" className="xl:col-span-3">
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <Input
                    label={`${f.label}${f.kind === "tl" ? " (TL)" : f.kind === "pct" ? " (%)" : ""}`}
                    value={values[f.key] ?? ""}
                    inputMode="decimal"
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                  {f.hint ? <p className="mt-1 text-xs text-slate-500">{f.hint}</p> : null}
                </div>
              ))}
            </div>
            <div>
              <Input label="Kurumsal kademeler (teslimat:indirim%)" value={tiers} onChange={(e) => setTiers(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Örn. 20:15, 50:25 → ayda 20+ teslimatta %15, 50+ teslimatta %25</p>
            </div>
            {draft?.errors.length ? <ErrorText>Geçersiz alanlar: {draft.errors.join(", ")}</ErrorText> : null}
            <ErrorText>{saveError}</ErrorText>
            {saveMsg ? <p className="text-sm text-emerald-700">{saveMsg}</p> : null}
            <Button type="submit" disabled={!draft || !!draft.errors.length}>
              Tarifeyi kaydet
            </Button>
          </form>
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <Card title="Önizleme (kaydetmeden önce)">
            <Table head={["Senaryo", "Mevcut", "Yeni"]}>
              {SCENARIOS.map((sc) => {
                const { night, ...rest } = sc.input as { night?: boolean } & Parameters<typeof calculatePrice>[0];
                const input = { ...rest, pickupAt: night ? NIGHT : DAY };
                const cur = data ? calculatePrice(input, data.settings).subtotalKurus : 0;
                const next = draft && !draft.errors.length ? calculatePrice(input, draft.settings).subtotalKurus : null;
                return (
                  <tr key={sc.label}>
                    <Td>{sc.label}</Td>
                    <Td className="whitespace-nowrap">{formatTL(cur)}</Td>
                    <Td className={`whitespace-nowrap font-semibold ${next != null && next !== cur ? "text-brand" : ""}`}>
                      {next == null ? "—" : formatTL(next)}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          </Card>

          <Card title="Resmi tatiller">
            <form onSubmit={addHoliday} className="mb-3 grid gap-2 sm:grid-cols-[auto_1fr_auto]">
              <Input type="date" required value={holiday.date} onChange={(e) => setHoliday({ ...holiday, date: e.target.value })} />
              <Input placeholder="Adı" required value={holiday.name} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} />
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={holiday.halfDay} onChange={(e) => setHoliday({ ...holiday, halfDay: e.target.checked })} />
                Arife
              </label>
              <Button type="submit" className="sm:col-span-3">
                Tatil ekle
              </Button>
            </form>
            <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
              {upcoming.map((h) => (
                <li key={h.date} className="flex items-center justify-between gap-2">
                  <span>
                    <span className="font-mono text-slate-500">{h.date}</span> {h.name}
                    {h.halfDay ? <span className="ml-1 text-xs text-amber-700">{"(13:00'ten itibaren)"}</span> : null}
                  </span>
                  <button className="text-xs text-red-700 underline" onClick={() => repo.deleteHoliday(h.date).then(reload)}>
                    Sil
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
