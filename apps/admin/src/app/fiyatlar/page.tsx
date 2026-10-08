"use client";

import {
  calculatePrice,
  DEFAULT_COST_MODEL,
  estimateJobCost,
  formatTL,
  indexPricingSettings,
  INDEXED_MONEY_FIELDS,
  type CostModel,
  type Holiday,
  type PriceInput,
  type PricingSettings,
} from "@yazgan/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Card, ErrorText, Input, PageHeader, Table, Td } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { repo } from "@/lib/repo";
import { formatKmTiers, parseCap, parseKmTiers } from "@/lib/pricing-form";
import { useLoad } from "@/lib/use-load";

type Kind = "tl" | "pct" | "int" | "kg" | "hour" | "coord";
type Field = { key: keyof PricingSettings; label: string; kind: Kind; hint?: string };
const FIELDS: Field[] = [
  { key: "baseFeeKurus", label: "Açılış ücreti", kind: "tl" },
  { key: "includedKm", label: "Açılışa dahil km", kind: "int" },
  { key: "perKmKurus", label: "Ek km ücreti (kademe yoksa)", kind: "tl" },
  { key: "economyDiscountPct", label: "Ekonomi indirimi", kind: "pct", hint: "Gün içi teslim; acil olmayan işler rotada birleştirilir" },
  { key: "economyCutoffHour", label: "Ekonomi son alış saati", kind: "hour", hint: "Pzt–Cmt gece bitişinden bu saate kadar seçilebilir" },
  { key: "urgentSurchargePct", label: "Acil ek ücreti", kind: "pct" },
  { key: "nightSurchargePct", label: "Gece ek ücreti", kind: "pct" },
  { key: "sundaySurchargePct", label: "Pazar ek ücreti", kind: "pct" },
  { key: "nightHolidaySurchargePct", label: "Resmi tatil ek ücreti", kind: "pct", hint: "Gece, Pazar ve tatil toplanmaz; en yükseği uygulanır" },
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
  { key: "freePickupRadiusKm", label: "Ücretsiz alış yarıçapı (km)", kind: "kg", hint: "Merkeze tahmini yol mesafesi; dışında uzak alış ücreti" },
  { key: "remotePickupPerKmKurus", label: "Uzak alış km ücreti", kind: "tl" },
  { key: "remotePickupMaxKurus", label: "Uzak alış ücreti en fazla", kind: "tl" },
  { key: "freeCoverageKurus", label: "Ücretsiz güvence (değer beyanı olmadan)", kind: "tl" },
  { key: "insuranceRatePct", label: "Değer beyanı sigorta oranı", kind: "pct", hint: "Beyanın ücretsiz güvenceyi aşan kısmına" },
  { key: "insuranceMinKurus", label: "En düşük sigorta ücreti", kind: "tl" },
  { key: "serviceCenterLat", label: "Merkez enlem", kind: "coord" },
  { key: "serviceCenterLng", label: "Merkez boylam", kind: "coord" },
  { key: "vatPct", label: "KDV", kind: "pct" },
];

const COST_FIELDS: Array<{ key: keyof CostModel; label: string; kind: "tl" | "pct" }> = [
  { key: "courierPerJobKurus", label: "Kuryeye iş başı", kind: "tl" },
  { key: "courierPerKmKurus", label: "Kuryeye km başı (yakıt dahil)", kind: "tl" },
  { key: "urgentBonusPct", label: "Acil işte kurye primi", kind: "pct" },
  { key: "offHoursBonusPct", label: "Gece/Pazar/tatil kurye primi", kind: "pct" },
  { key: "economyJobPayPct", label: "Ekonomide iş başı ödeme oranı", kind: "pct" },
  { key: "waitingSharePct", label: "Bekleme ücretinden kurye payı", kind: "pct" },
  { key: "overheadPerJobKurus", label: "İş başı genel gider", kind: "tl" },
  { key: "cardFeePct", label: "Kart komisyonu", kind: "pct" },
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
const fromCoord = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && Math.abs(n) <= 180 ? n : null;
};

const DAY = new Date("2026-10-07T08:00:00Z"); // Çarşamba 11:00 İstanbul
const NIGHT = new Date("2026-10-07T20:30:00Z"); // 23:30 İstanbul
const SUNDAY = new Date("2026-10-11T09:00:00Z"); // Pazar 12:00 İstanbul
const SCENARIOS: Array<{ label: string; input: PriceInput }> = [
  { label: "5 km standart (gündüz)", input: { distanceMeters: 5_000, pickupAt: DAY } },
  { label: "5 km ekonomi", input: { distanceMeters: 5_000, serviceLevel: "ekonomi", pickupAt: DAY } },
  { label: "12 km acil", input: { distanceMeters: 12_000, serviceLevel: "acil", pickupAt: DAY } },
  { label: "8 km gece", input: { distanceMeters: 8_000, pickupAt: NIGHT } },
  { label: "8 km Pazar", input: { distanceMeters: 8_000, pickupAt: SUNDAY } },
  { label: "12 km acil + gece", input: { distanceMeters: 12_000, serviceLevel: "acil", pickupAt: NIGHT } },
  { label: "22 km köprü geçişli", input: { distanceMeters: 22_000, bridgeCrossings: 1, pickupAt: DAY } },
  { label: "6 km gidiş-dönüş, 12 kg", input: { distanceMeters: 6_000, returnDistanceMeters: 6_000, roundTrip: true, weightKg: 12, pickupAt: DAY } },
  { label: "4 km, 32 dk bekleme", input: { distanceMeters: 4_000, waitingMinutes: 32, pickupAt: DAY } },
  { label: "Tuzla'dan alış, 8 km", input: { distanceMeters: 8_000, pickupPoint: { lat: 40.816, lng: 29.3 }, pickupAt: DAY } },
];

/** Senaryo hesaplanamazsa (ör. ekonomi saat dışı) null */
const tryPrice = (input: PriceInput, s: PricingSettings) => {
  try {
    return calculatePrice(input, s);
  } catch {
    return null;
  }
};

export default function FiyatlarPage() {
  const { data, error, reload } = useLoad(() => repo.getPricing());
  const [values, setValues] = useState<Record<string, string>>({});
  const [tiers, setTiers] = useState("");
  const [kmTiers, setKmTiers] = useState("");
  const [cap, setCap] = useState("");
  const [maxWeight, setMaxWeight] = useState("");
  const [maxDeclared, setMaxDeclared] = useState("");
  const [indexPct, setIndexPct] = useState("");
  const [indexMsg, setIndexMsg] = useState<string | null>(null);
  const costLoad = useLoad(() => repo.getCostModel());
  const [cost, setCost] = useState<CostModel>(DEFAULT_COST_MODEL);
  const [costText, setCostText] = useState<Record<string, string>>({});
  const [costMsg, setCostMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [holiday, setHoliday] = useState<Holiday>({ date: "", name: "", halfDay: false });

  useEffect(() => {
    if (!data) return;
    setValues(Object.fromEntries(FIELDS.map((f) => [f.key, toInput(data.settings[f.key] as number, f.kind)])));
    setTiers(data.settings.corporateTiers.map((t) => `${t.minDeliveries}:${t.discountPct}`).join(", "));
    setKmTiers(formatKmTiers(data.settings.kmTiers));
    setCap(data.settings.maxSurchargePct == null ? "" : String(data.settings.maxSurchargePct));
    setMaxWeight(data.settings.maxWeightKg == null ? "" : String(data.settings.maxWeightKg));
    setMaxDeclared(data.settings.maxDeclaredValueKurus == null ? "" : String(data.settings.maxDeclaredValueKurus / 100));
  }, [data]);

  useEffect(() => {
    const m = costLoad.data;
    if (!m) return;
    setCost(m);
    setCostText(Object.fromEntries(COST_FIELDS.map((f) => [f.key, toInput(m[f.key], f.kind)])));
  }, [costLoad.data]);

  function setCostField(key: keyof CostModel, kind: "tl" | "pct", text: string) {
    setCostText((t) => ({ ...t, [key]: text }));
    setCostMsg(null);
    const v = fromInput(text, kind);
    if (v != null) setCost((c) => ({ ...c, [key]: v }));
  }
  const costInvalid = COST_FIELDS.some((f) => fromInput(costText[f.key] ?? "", f.kind) == null);

  async function saveCost() {
    try {
      await repo.saveCostModel(cost);
      setCostMsg("Kaydedildi. Bundan sonraki teslimatların hakedişi bu modelle hesaplanır.");
    } catch (e) {
      setCostMsg(e instanceof Error ? e.message : "Kaydedilemedi");
    }
  }

  function applyIndex() {
    if (!draft || draft.errors.length) return;
    const rate = Number(indexPct.replace(",", "."));
    let next: PricingSettings;
    try {
      next = indexPricingSettings(draft.settings, rate);
    } catch (e) {
      setIndexMsg(e instanceof Error ? e.message : "Geçersiz oran");
      return;
    }
    setValues((v) => ({ ...v, ...Object.fromEntries(INDEXED_MONEY_FIELDS.map((k) => [k, toInput(next[k], "tl")])) }));
    setKmTiers(formatKmTiers(next.kmTiers));
    setIndexMsg(`Para alanları %${rate} güncellendi (köprü hariç, yuvarlandı). Önizlemeyi kontrol edip kaydedin.`);
  }

  // Formdaki değerlerden ayar nesnesi (geçersiz alan varsa hatalarla)
  const draft = useMemo(() => {
    if (!data) return null;
    const errors: string[] = [];
    const s: PricingSettings = { ...data.settings };
    for (const f of FIELDS) {
      const v = f.kind === "coord" ? fromCoord(values[f.key] ?? "") : fromInput(values[f.key] ?? "", f.kind);
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
    const kt = parseKmTiers(kmTiers);
    if (kt === null) errors.push("Km kademeleri");
    else s.kmTiers = kt;
    const c = parseCap(cap);
    if (c === undefined) errors.push("Ek ücret tavanı");
    else s.maxSurchargePct = c;
    const w = parseCap(maxWeight);
    if (w === undefined || w === 0) errors.push("Ağırlık sınırı");
    else s.maxWeightKg = w;
    const md = parseCap(maxDeclared.replace(/\./g, ""));
    if (md === undefined || md === 0) errors.push("En yüksek değer beyanı");
    else s.maxDeclaredValueKurus = md == null ? null : Math.round(md * 100);
    if (s.economyCutoffHour <= s.nightEndHour) errors.push("Ekonomi son alış saati");
    if (s.waitingBlockMinutes <= 0) errors.push("Bekleme dilimi");
    return { settings: s, errors };
  }, [data, values, tiers, kmTiers, cap, maxWeight, maxDeclared]);

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
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Input label="Km kademeleri (toplam km'ye kadar : TL/km)" value={kmTiers} onChange={(e) => setKmTiers(e.target.value)} />
                <p className="mt-1 text-xs text-slate-500">
                  Örn. 10:25, *:18 → açılıştan sonra 10 km&apos;ye kadar 25 TL, üstü 18 TL. Boş bırakılırsa sabit km ücreti kullanılır.
                </p>
              </div>
              <div>
                <Input label="Acil + gece toplam ek ücret tavanı (%)" value={cap} inputMode="decimal" onChange={(e) => setCap(e.target.value)} />
                <p className="mt-1 text-xs text-slate-500">Örn. 75. Boş bırakılırsa tavan yok (acil + gece/Pazar/tatil toplanır).</p>
              </div>
              <div>
                <Input label="Motosiklet ağırlık sınırı (kg)" value={maxWeight} inputMode="decimal" onChange={(e) => setMaxWeight(e.target.value)} />
                <p className="mt-1 text-xs text-slate-500">Üzerindeki gönderi kabul edilmez. Boş bırakılırsa sınır yok.</p>
              </div>
              <div>
                <Input label="En yüksek değer beyanı (TL)" value={maxDeclared} inputMode="decimal" onChange={(e) => setMaxDeclared(e.target.value)} />
                <p className="mt-1 text-xs text-slate-500">Daha değerli gönderi kabul edilmez (sigortacınızın teminat sınırı). Boş = sınırsız.</p>
              </div>
            </div>
            <div>
              <Input label="Kurumsal kademeler (teslimat:indirim%)" value={tiers} onChange={(e) => setTiers(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Örn. 20:15, 50:25 → ayda 20+ teslimatta %15, 50+ teslimatta %25</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <Input label="Endeks / enflasyon güncellemesi (%)" value={indexPct} inputMode="decimal" onChange={(e) => setIndexPct(e.target.value)} />
                <Button type="button" variant="secondary" onClick={applyIndex} disabled={!indexPct.trim() || !draft || !!draft.errors.length}>
                  Para alanlarına uygula
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Önerilen: 3 ayda bir TÜFE oranı kadar. Açılış, km kademeleri, bekleme, ağır paket ve uzak alış ücretleri artar; köprü (resmi tarife) ve yüzdeler değişmez.
              </p>
              {indexMsg ? <p className="mt-1 text-xs text-brand">{indexMsg}</p> : null}
            </div>
            {draft?.errors.length ? <ErrorText>Geçersiz alanlar: {draft.errors.join(", ")}</ErrorText> : null}
            <ErrorText>{saveError}</ErrorText>
            {saveMsg ? <p className="text-sm text-emerald-700">{saveMsg}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!draft || !!draft.errors.length}>
                Tarifeyi kaydet
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  // İlk tarife: sabit 30 TL/km, ek ücret tavanı yok (kaydetmeden önce önizlemede görünür)
                  setKmTiers("");
                  setCap("");
                  setValues((v) => ({ ...v, perKmKurus: "30" }));
                }}
              >
                İlk tarifeyi yükle (30 TL/km, tavansız)
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <Card title="Önizleme ve marj (kaydetmeden önce)">
            <Table head={["Senaryo", "Mevcut", "Yeni", "Maliyet", "Marj"]}>
              {SCENARIOS.map((sc) => {
                const cur = data ? tryPrice(sc.input, data.settings) : null;
                const nextSettings = draft && !draft.errors.length ? draft.settings : null;
                const next = nextSettings ? tryPrice(sc.input, nextSettings) : null;
                const c = next && nextSettings ? estimateJobCost(next, cost, { settings: nextSettings }) : null;
                return (
                  <tr key={sc.label}>
                    <Td>{sc.label}</Td>
                    <Td className="whitespace-nowrap">{cur ? formatTL(cur.subtotalKurus) : "—"}</Td>
                    <Td className={`whitespace-nowrap font-semibold ${next && cur && next.subtotalKurus !== cur.subtotalKurus ? "text-brand" : ""}`}>
                      {next ? formatTL(next.subtotalKurus) : "—"}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-600">{c ? formatTL(c.totalKurus) : "—"}</Td>
                    <Td className={`whitespace-nowrap font-semibold ${c && c.marginPct < 20 ? "text-red-700" : "text-emerald-700"}`}>
                      {c ? `%${c.marginPct.toLocaleString("tr-TR")}` : "—"}
                    </Td>
                  </tr>
                );
              })}
            </Table>
            <p className="mt-2 text-xs text-slate-500">
              KDV hariç. Maliyet aşağıdaki kurye ödeme modeliyle tahmindir; %20 altı marj kırmızı. Kart komisyonu dahil değildir.
            </p>
          </Card>

          <Card title="Kurye ödeme ve maliyet modeli">
            <div className="grid gap-3 sm:grid-cols-2">
              {COST_FIELDS.map((f) => (
                <Input
                  key={f.key}
                  label={`${f.label}${f.kind === "tl" ? " (TL)" : " (%)"}`}
                  value={costText[f.key] ?? ""}
                  inputMode="decimal"
                  onChange={(e) => setCostField(f.key, f.kind, e.target.value)}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Esnaf kurye modeli (paket + km başı, yakıt kuryede; köprü geçişi kuryeye iade). Kurye hakedişi ve yukarıdaki marj bu
              modelle hesaplanır; müşteri fiyatını etkilemez. Önizleme kaydetmeden günceller.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" onClick={saveCost} disabled={costInvalid || !costLoad.data} data-testid="save-cost">
                Ödeme modelini kaydet
              </Button>
              {costInvalid ? <ErrorText>Geçersiz değer var</ErrorText> : null}
              {costMsg ? <span className="text-sm text-emerald-700">{costMsg}</span> : null}
            </div>
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
