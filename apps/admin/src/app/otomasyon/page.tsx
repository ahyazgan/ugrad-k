"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Card, ErrorText, Input, PageHeader } from "@/components/ui";
import { repo, type DispatchResult, type OpsSettings } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const NUMBERS: Array<{ key: keyof OpsSettings; label: string; hint: string }> = [
  { key: "maxActiveOrdersPerCourier", label: "Kurye başına en fazla aktif iş", hint: "Atanmış + alınmış + yolda" },
  { key: "maxPickupDistanceKm", label: "Alışa en fazla uzaklık (km)", hint: "Tahmini yol mesafesi" },
  { key: "locationMaxAgeMinutes", label: "Konum en fazla kaç dakikalık olsun", hint: "Daha eski konumdaki kuryeye atanmaz" },
  { key: "unassignedAlertMinutes", label: "Atanamayan sipariş uyarısı (dk)", hint: "Bu süre sonunda size WhatsApp/SMS gelir" },
  { key: "unpaidCardTimeoutMinutes", label: "Kartla ödeme süresi (dk)", hint: "Ödenmeyen kart siparişi bu süre sonunda iptal edilir" },
];

export default function OtomasyonPage() {
  const { data, error, reload } = useLoad(() => repo.getOpsSettings());
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setRunError(null);
    try {
      setResult(await repo.runDispatch());
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Dağıtım çalıştırılamadı");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Otomasyon"
        subtitle="Yeni siparişler otomatik onaylanır ve en uygun kuryeye atanır (dakikada bir). Sizin yalnızca istisnalarla ilgilenmeniz yeterli."
        actions={
          <Button onClick={run} disabled={running} data-testid="run-dispatch">
            {running ? "Çalışıyor…" : "Şimdi dağıt"}
          </Button>
        }
      />
      <ErrorText>{error ?? runError}</ErrorText>
      {result ? (
        <Card className="mb-6" title="Son dağıtım">
          <p className="text-sm" data-testid="dispatch-result">
            {result.approved} sipariş onaylandı · {result.assigned.length} sipariş kuryeye atandı · {result.unassigned.length} sipariş için uygun kurye yok
          </p>
          {result.assigned.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {result.assigned.map((a) => (
                <li key={a.orderId}>
                  <Link className="text-brand underline" href={`/siparisler/${a.orderId}`}>
                    Sipariş
                  </Link>{" "}
                  → alışa {a.distanceKm.toLocaleString("tr-TR")} km
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
      {data ? <OpsForm key={JSON.stringify(data)} initial={data} onSaved={reload} /> : null}
    </>
  );
}

/** Ayar formu; kayıtlı değerler değişince key ile yeniden kurulur. */
function OpsForm({ initial, onSaved }: { initial: OpsSettings; onSaved: () => void }) {
  const [form, setForm] = useState<OpsSettings>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSaveError(null);
    const bad = NUMBERS.find((n) => !(Number(form[n.key]) > 0));
    if (bad) {
      setSaveError(`Geçersiz değer: ${bad.label}`);
      return;
    }
    try {
      await repo.saveOpsSettings(form);
      setMsg("Kaydedildi");
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Kaydedilemedi");
    }
  }

  return (
    <form onSubmit={save} className="grid gap-6 xl:grid-cols-2">
      <Card title="Otomatik işlemler">
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={form.autoApprove} onChange={(e) => setForm({ ...form, autoApprove: e.target.checked })} data-testid="auto-approve" />
            <span>
              <b>Siparişleri otomatik onayla</b>
              <span className="block text-slate-500">Kartla ödenecek siparişler ödeme alınınca onaylanır.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={form.autoAssign} onChange={(e) => setForm({ ...form, autoAssign: e.target.checked })} data-testid="auto-assign" />
            <span>
              <b>Kuryeyi otomatik ata</b>
              <span className="block text-slate-500">
                Vardiyadaki, konumu güncel kuryelerden alışa en yakın ve en az yüklü olana; acil siparişler önce. İşi bırakan kuryeye aynı iş
                tekrar verilmez. Planlı siparişler alıştan 30 dk önce atanır.
              </span>
            </span>
          </label>
        </div>
      </Card>
      <Card title="Sınırlar">
        <div className="grid gap-3 sm:grid-cols-2">
          {NUMBERS.map((n) => (
            <div key={n.key}>
              <Input
                label={n.label}
                inputMode="decimal"
                value={String(form[n.key])}
                onChange={(e) => setForm({ ...form, [n.key]: Number(e.target.value.replace(",", ".")) })}
              />
              <p className="mt-1 text-xs text-slate-500">{n.hint}</p>
            </div>
          ))}
        </div>
      </Card>
      <div className="xl:col-span-2">
        <ErrorText>{saveError}</ErrorText>
        {msg ? <p className="mb-2 text-sm text-emerald-700">{msg}</p> : null}
        <Button type="submit">Ayarları kaydet</Button>
      </div>
    </form>
  );
}
