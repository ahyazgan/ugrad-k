"use client";

import { ageLabel } from "@yazgan/shared";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, Card, ErrorText, Input, PageHeader } from "@/components/ui";
import { repo, type DispatchResult, type OpsSettings, type ReadinessItem } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const NUMBERS: Array<{ key: keyof OpsSettings; label: string; hint: string; allowZero?: boolean }> = [
  { key: "maxActiveOrdersPerCourier", label: "Kurye başına en fazla aktif iş", hint: "Atanmış + alınmış + yolda" },
  { key: "maxPickupDistanceKm", label: "Alışa en fazla uzaklık (km)", hint: "Tahmini yol mesafesi" },
  { key: "locationMaxAgeMinutes", label: "Konum en fazla kaç dakikalık olsun", hint: "Daha eski konumdaki kuryeye atanmaz" },
  { key: "unassignedAlertMinutes", label: "Atanamayan sipariş uyarısı (dk)", hint: "Bu süre sonunda size WhatsApp/SMS gelir" },
  { key: "unpaidCardTimeoutMinutes", label: "Kartla ödeme süresi (dk)", hint: "Ödenmeyen kart siparişi bu süre sonunda iptal edilir" },
  { key: "urgentSlaMinutes", label: "Acil teslim taahhüdü (dk)", hint: "Aşılırsa acil ek ücreti müşterinin sonraki siparişinden düşülür" },
  { key: "documentWarnDays", label: "Belge süresi uyarısı (gün)", hint: "Kurye belgesinin bitmesine bu kadar gün kala uyarı" },
  { key: "offerTimeoutSeconds", label: "Teklif yanıt süresi (sn)", hint: "15–600; süre dolarsa iş sıradaki kuryeye geçer" },
  { key: "arrivalAutoRadiusM", label: "Otomatik varış mesafesi (m)", hint: "30–500; konum adrese bu kadar yaklaşınca 'kurye kapıda'" },
  { key: "arrivalMaxRadiusM", label: "'Vardım' için en fazla uzaklık (m)", hint: "50–2000; daha uzaktan varış bildirilemez" },
  { key: "maxBreakMinutes", label: "En uzun mola (dk)", hint: "5–240; aşılırsa size WhatsApp/SMS gelir" },
  {
    key: "offerAutoBreakAfter",
    label: "Yanıtsız teklif sonrası otomatik mola",
    hint: "Üst üste bu kadar teklife yanıt vermeyen kurye molaya alınır (0 = kapalı)",
    allowZero: true,
  },
  {
    key: "failedDeliveryMinWaitMinutes",
    label: "Teslim edilemedi için en az bekleme (dk)",
    hint: "0–60; kurye teslim adresinde bu kadar beklemeden iade başlatamaz",
    allowZero: true,
  },
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
      <SystemHealthCard />
      <ReadinessCard />
      {data ? <OpsForm key={JSON.stringify(data)} initial={data} onSaved={reload} /> : null}
    </>
  );
}

const JOB_LABELS: Record<string, string> = {
  "notify-dispatch": "Bildirim gönderimi",
  "auto-dispatch": "Otomatik dağıtım",
  "webhook-dispatch": "Kurumsal webhook",
  "invoice-dispatch": "Fatura kesimi",
  "courier-earnings": "Kurye hakedişi",
  health: "Sistem denetimi",
};

/** Zamanlanmış görevlerin son çalışması ve açık sorunlar (health fonksiyonu) */
function SystemHealthCard() {
  const { data, error, reload } = useLoad(() => repo.getSystemHealth());
  return (
    <Card
      className="mb-6"
      title="Sistem durumu"
      actions={
        <Button variant="ghost" onClick={reload}>
          Yenile
        </Button>
      }
    >
      <ErrorText>{error}</ErrorText>
      {data ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2" data-testid="system-health">
          <div>
            {data.issues.length === 0 ? (
              <p className="font-semibold text-emerald-700">✓ Her şey yolunda</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.issues.map((i) => (
                  <li key={i.key} className={i.severity === "critical" ? "font-semibold text-red-700" : "text-amber-700"}>
                    {i.severity === "critical" ? "● Kritik: " : "● Uyarı: "}
                    {i.message}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">
              Vardiyada {data.snapshot.couriers_on_shift} kurye · sorunlar yöneticiye WhatsApp/SMS ile bildirilir (5 dakikada bir denetim).
            </p>
          </div>
          <table className="text-sm">
            <tbody>
              {Object.entries(JOB_LABELS).map(([job, label]) => {
                const at = data.snapshot.heartbeats[job];
                return (
                  <tr key={job}>
                    <td className="py-0.5 pr-3 text-slate-600">{label}</td>
                    <td className="py-0.5 text-slate-900">{at ? ageLabel(at) : <span className="text-red-700">hiç çalışmadı</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}

const READY_ICON: Record<ReadinessItem["status"], { mark: string; cls: string; label: string }> = {
  ok: { mark: "✓", cls: "text-emerald-700", label: "Hazır" },
  uyari: { mark: "!", cls: "text-amber-700", label: "Uyarı" },
  eksik: { mark: "✗", cls: "text-red-700", label: "Eksik" },
};

/** Canlıya hazırlık: hangi servis gerçek, hangisi sahte; cron ve ayarlar (readiness fonksiyonu, gizli değer göstermez) */
function ReadinessCard() {
  const [open, setOpen] = useState(false);
  const { data, error, reload } = useLoad(() => repo.getReadiness());
  const groups = data ? [...new Set(data.items.map((i) => i.group))] : [];
  const missing = data?.items.filter((i) => i.status === "eksik").length ?? 0;
  const warn = data?.items.filter((i) => i.status === "uyari").length ?? 0;
  return (
    <Card
      className="mb-6"
      title="Canlıya hazırlık"
      actions={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setOpen(!open)} data-testid="readiness-toggle">
            {open ? "Gizle" : "Ayrıntılar"}
          </Button>
          <Button variant="ghost" onClick={reload}>
            Yenile
          </Button>
        </div>
      }
    >
      <ErrorText>{error}</ErrorText>
      {data ? (
        <div data-testid="readiness">
          <p className={`text-sm font-semibold ${data.ready ? "text-emerald-700" : "text-red-700"}`} data-testid="readiness-summary">
            {data.ready ? "✓ Canlıya hazır" : `✗ ${missing} eksik`}
            {warn ? <span className="font-normal text-amber-700"> · {warn} uyarı</span> : null}
          </p>
          <p className="mt-1 text-xs text-muted">
            Eksik servisler sahte (deneme) sağlayıcıyla çalışır; gerçek müşteri almadan önce tamamlayın. Bölüm numaraları docs/kurulum.md&apos;yi gösterir.
          </p>
          {open ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {groups.map((g) => (
                <div key={g}>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g}</h3>
                  <ul className="space-y-1 text-sm">
                    {data.items
                      .filter((i) => i.group === g)
                      .map((i) => {
                        const icon = READY_ICON[i.status];
                        return (
                          <li key={i.key} data-testid={`ready-${i.key}`} className="flex gap-2">
                            <span className={`w-4 shrink-0 font-bold ${icon.cls}`} aria-label={icon.label}>
                              {icon.mark}
                            </span>
                            <span>
                              <span className="text-slate-900">{JOB_LABELS[i.label] ?? i.label}</span>
                              <span className="block text-xs text-muted">
                                {i.detail}
                                {i.doc ? ` · ${i.doc}` : ""}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
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
    const bad = NUMBERS.find((n) => !(Number(form[n.key]) > 0 || (n.allowZero && Number(form[n.key]) === 0)));
    if (bad) {
      setSaveError(`Geçersiz değer: ${bad.label}`);
      return;
    }
    if (form.offerTimeoutSeconds < 15 || form.offerTimeoutSeconds > 600) {
      setSaveError("Teklif yanıt süresi 15–600 saniye olmalı");
      return;
    }
    if (form.arrivalAutoRadiusM < 30 || form.arrivalAutoRadiusM > 500 || form.arrivalMaxRadiusM < 50 || form.arrivalMaxRadiusM > 2000) {
      setSaveError("Varış mesafeleri: otomatik 30–500 m, 'Vardım' 50–2000 m");
      return;
    }
    if (form.maxBreakMinutes < 5 || form.maxBreakMinutes > 240 || form.offerAutoBreakAfter < 0 || form.offerAutoBreakAfter > 20) {
      setSaveError("Mola: en uzun 5–240 dk, otomatik mola 0–20 teklif");
      return;
    }
    if (form.failedDeliveryMinWaitMinutes < 0 || form.failedDeliveryMinWaitMinutes > 60) {
      setSaveError("Teslim edilemedi bekleme süresi 0–60 dk olmalı");
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
    <form onSubmit={save} className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
      <Card title="Otomatik işlemler">
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={form.autoApprove} onChange={(e) => setForm({ ...form, autoApprove: e.target.checked })} data-testid="auto-approve" />
            <span>
              <b>Siparişleri otomatik onayla</b>
              <span className="block text-muted">Kartla ödenecek siparişler ödeme alınınca onaylanır.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={form.autoAssign} onChange={(e) => setForm({ ...form, autoAssign: e.target.checked })} data-testid="auto-assign" />
            <span>
              <b>Kuryeyi otomatik ata</b>
              <span className="block text-muted">
                Vardiyadaki, konumu güncel kuryelerden alışa en yakın ve en az yüklü olana; acil siparişler önce. İşi bırakan kuryeye aynı iş
                tekrar verilmez. Planlı siparişler alıştan 30 dk önce atanır.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={form.offerEnabled} onChange={(e) => setForm({ ...form, offerEnabled: e.target.checked })} data-testid="offer-enabled" />
            <span>
              <b>İşi kuryeye teklif olarak gönder</b>
              <span className="block text-muted">
                Otomatik atanan iş kuryeye sesli bildirimle teklif edilir; kurye süre içinde kabul etmezse veya reddederse sıradaki kuryeye
                geçer. Reddeden kuryeye aynı iş tekrar önerilmez. Müşteriye &quot;kurye atandı&quot; mesajı kabulden sonra gider.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.enforceCourierDocuments}
              onChange={(e) => setForm({ ...form, enforceCourierDocuments: e.target.checked })}
              data-testid="enforce-docs"
            />
            <span>
              <b>Belgesi eksik kuryeyi çalıştırma</b>
              <span className="block text-muted">
                Ehliyet, kurye faaliyet belgesi, ruhsat veya trafik sigortası eksik ya da süresi dolmuş kurye vardiya başlatamaz ve otomatik iş
                almaz (Kuryeler → Belgeler).
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
              <p className="mt-1 text-xs text-muted">{n.hint}</p>
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
