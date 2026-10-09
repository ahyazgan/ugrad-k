"use client";

import { COURIER_DOCUMENT_TYPES, courierPerformance, INCIDENT_KINDS, PERFORMANCE_TIERS, type PerformanceTier } from "@yazgan/shared";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { ComplianceBadge, complianceOf, CourierDocumentsCard } from "@/components/CourierDocuments";
import { Button, Card, cx, Drawer, EmptyState, ErrorText, Input, PageHeader, Table, Td } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { fmtDateTime, istDate } from "@/lib/dates";
import { dayCoverage, recentOrDate } from "@/lib/ops";
import { repo, type Incident } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const EMPTY_FORM = { fullName: "", phone: "", plate: "", vehicleModel: "" };

export default function KuryelerPage() {
  const today = istDate();
  const { data, error, reload } = useLoad(() => repo.listCouriers());
  const docsLoad = useLoad(() => repo.listCourierDocuments());
  const ops = useLoad(() => repo.getOpsSettings());
  const incidents = useLoad(() => repo.listIncidents({ limit: 20 }));
  const perf = useLoad(() => repo.courierPerformanceStats());
  const plan = useLoad(() => repo.listShiftPlan(today, 1), [today]);
  const warnDays = ops.data?.documentWarnDays ?? 30;
  const [selected, setSelected] = useState<string | null>(null);
  const docsOf = (id: string) => (docsLoad.data ?? []).filter((d) => d.courierId === id);
  const selectedCourier = (data ?? []).find((c) => c.id === selected) ?? null;

  // Bakanlık / sigorta bildirimi için kurye listesi (belge bitiş tarihleriyle)
  function exportCsv() {
    const types = COURIER_DOCUMENT_TYPES.filter((t) => t.required || t.kind === "src");
    downloadCsv("kurye_listesi.csv", [
      ["Ad Soyad", "Telefon", "Plaka", "Motor", "Durum", ...types.flatMap((t) => [`${t.label} no`, `${t.label} bitiş`]), "Belge durumu"],
      ...(data ?? []).map((c) => {
        const docs = docsOf(c.id);
        const comp = complianceOf(docs, warnDays);
        return [
          c.fullName,
          c.phone,
          c.plate,
          c.vehicleModel,
          c.active ? "Aktif" : "Pasif",
          ...types.flatMap((t) => {
            const d = docs.find((x) => x.kind === t.kind);
            return [d?.docNumber ?? "", d ? (d.expiresAt ?? "süresiz") : "yok"];
          }),
          comp.ok ? "Uygun" : `Eksik: ${comp.blocking.map((b) => b.label).join(", ")}`,
        ];
      }),
    ]);
  }
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await repo.createCourier(form);
      setForm(EMPTY_FORM);
      setFormOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Eklenemedi");
    } finally {
      setSaving(false);
    }
  }

  // Documents expiring within documentWarnDays or already expired (missing ones show in the table badge)
  const docWarnings = useMemo(() => {
    const rows: Array<{ courierId: string; name: string; label: string; daysLeft: number }> = [];
    for (const c of data ?? []) {
      if (!c.active) continue;
      for (const w of complianceOf(docsOf(c.id), warnDays).warnings) {
        if (w.daysLeft == null) continue;
        rows.push({ courierId: c.id, name: c.fullName ?? "Kurye", label: w.label, daysLeft: w.daysLeft });
      }
    }
    return rows.sort((a, b) => a.daysLeft - b.daysLeft);
    // docsOf reads docsLoad.data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, docsLoad.data, warnDays]);

  const coverage = plan.data ? dayCoverage(plan.data.templates, plan.data.bookings, today) : null;
  const sortedIncidents = [...(incidents.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const openIncidents = sortedIncidents.filter((i) => !i.resolvedAt);
  const [showAllIncidents, setShowAllIncidents] = useState(false);
  const active = (data ?? []).filter((c) => c.active);

  return (
    <>
      <PageHeader
        title="Kuryeler"
        subtitle="Kurye, uygulamaya kendi telefon numarasıyla SMS koduyla giriş yapar. Zorunlu belgeleri eksik kurye vardiyaya giremez (Otomasyon'dan kapatılabilir)."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!data?.length}>
              Kurye listesi (CSV)
            </Button>
            <Button onClick={() => setFormOpen(true)}>+ Kurye</Button>
          </>
        }
      />
      <ErrorText>{error}</ErrorText>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card
            title={`Kurye listesi${data ? ` · ${active.length} aktif` : ""}`}
            actions={
              data ? (
                <span className="text-xs text-muted">
                  {active.filter((c) => c.isOnShift).length} vardiyada · {active.filter((c) => c.onBreak).length} molada
                </span>
              ) : null
            }
          >
            <Table
              head={["Kurye", "Durum / konum", "Belgeler", "Performans (30 gün)", "Aktif iş"]}
              num={[4]}
              empty={
                <EmptyState
                  sticker="kask"
                  title="Henüz kurye yok"
                  description="İlk kuryeyi ekleyin veya web sitesinden gelen kurye başvurularını onaylayın."
                  action={
                    <>
                      <Button size="sm" onClick={() => setFormOpen(true)}>
                        + Kurye
                      </Button>
                      <Link href="/basvurular" className="text-sm font-semibold text-brand underline underline-offset-2">
                        Kurye başvuruları
                      </Link>
                    </>
                  }
                />
              }
            >
              {(data ?? []).map((c) => (
                <tr key={c.id} className={cx(!c.active && "opacity-50", selected === c.id && "bg-brand-light/60")}>
                  <Td>
                    <div className="font-semibold">{c.fullName}</div>
                    <div className="text-xs text-muted">{c.phone}</div>
                    <div className="text-xs text-muted">
                      {c.plate}
                      {c.vehicleModel ? ` · ${c.vehicleModel}` : ""}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {!c.active ? (
                      "Pasif"
                    ) : c.onBreak ? (
                      <span className="font-semibold text-amber-700">Molada</span>
                    ) : c.isOnShift ? (
                      <span className="font-semibold text-emerald-700">Vardiyada</span>
                    ) : (
                      "Vardiya dışı"
                    )}
                    {c.lastLat != null && c.lastLng != null ? (
                      <a
                        className="block text-xs text-muted underline underline-offset-2 hover:text-brand"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.google.com/maps?q=${c.lastLat},${c.lastLng}`}
                        title="Son konumu haritada aç"
                      >
                        konum {c.lastLocationAt ? recentOrDate(c.lastLocationAt) : "var"}
                      </a>
                    ) : null}
                    <button
                      className="mt-1 block text-xs font-semibold text-muted underline underline-offset-2 hover:text-brand"
                      onClick={() => repo.updateCourier(c.id, { active: !c.active }).then(reload)}
                    >
                      {c.active ? "Pasifleştir" : "Aktifleştir"}
                    </button>
                  </Td>
                  <Td>
                    <button className="text-left" onClick={() => setSelected(c.id)} data-testid={`docs-${c.id}`}>
                      <ComplianceBadge c={complianceOf(docsOf(c.id), warnDays)} />
                      <span className="mt-0.5 block text-xs text-brand underline">Belgeler</span>
                    </button>
                  </Td>
                  <Td>
                    <PerformanceCell stats={perf.data?.[c.id]} courierId={c.id} />
                  </Td>
                  <Td num>{c.activeOrderCount}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          {selectedCourier ? (
            <CourierDocumentsCard
              courierId={selectedCourier.id}
              name={selectedCourier.fullName ?? "Kurye"}
              docs={docsOf(selectedCourier.id)}
              warnDays={warnDays}
              onSaved={docsLoad.reload}
            />
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="Belge uyarıları" actions={<span className="text-xs text-muted">{warnDays} gün içinde</span>}>
            {!docsLoad.data || !data ? (
              <p className="text-sm text-muted">Yükleniyor…</p>
            ) : docWarnings.length === 0 ? (
              <p className="text-sm text-muted">Süresi dolan veya {warnDays} gün içinde dolacak belge yok.</p>
            ) : (
              <ul className="divide-y divide-line" data-testid="doc-warnings">
                {docWarnings.map((w) => (
                  <li key={`${w.courierId}-${w.label}`}>
                    <button className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:bg-canvas" onClick={() => setSelected(w.courierId)}>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{w.name}</span>
                        <span className="block truncate text-xs text-muted">{w.label}</span>
                      </span>
                      <span
                        className={cx(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                          w.daysLeft < 0 ? "bg-red-50 text-red-700" : w.daysLeft <= 7 ? "bg-amber-100 text-amber-800" : "bg-amber-50 text-amber-800",
                        )}
                      >
                        {w.daysLeft < 0 ? `${-w.daysLeft} gün önce doldu` : w.daysLeft === 0 ? "bugün doluyor" : `${w.daysLeft} gün kaldı`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Bugünkü vardiya"
            actions={
              <Link href="/vardiya-plani" className="text-sm font-semibold text-brand underline-offset-2 hover:underline">
                Plan →
              </Link>
            }
          >
            {!coverage ? (
              <p className="text-sm text-muted">Yükleniyor…</p>
            ) : coverage.slots.length === 0 ? (
              <p className="text-sm text-muted">Bugün için tanımlı vardiya dilimi yok.</p>
            ) : (
              <>
                <ul className="space-y-2" data-testid="today-coverage">
                  {coverage.slots.map((s) => {
                    const short = s.booked < s.required;
                    return (
                      <li key={s.templateId} className="flex items-start justify-between gap-3 text-sm">
                        <span className="min-w-0">
                          <span className="font-semibold tabular-nums">
                            {s.start}–{s.end}
                          </span>
                          <span className="block truncate text-xs text-muted">{s.names.length ? s.names.join(", ") : "Kimse yazılmadı"}</span>
                        </span>
                        <span
                          className={cx(
                            "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                            short ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700",
                          )}
                        >
                          {s.booked}/{s.required}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
                  {coverage.filled}/{coverage.required} kurye-dilim dolu{coverage.pct != null ? ` · %${coverage.pct}` : ""}
                </p>
              </>
            )}
          </Card>
        </div>
      </div>

      <Card
        title="Acil durum kayıtları"
        className="mt-6"
        id="acil-durum"
        actions={
          openIncidents.length === 0 && sortedIncidents.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setShowAllIncidents((v) => !v)}>
              {showAllIncidents ? "Gizle" : `Tüm kayıtlar (${sortedIncidents.length})`}
            </Button>
          ) : null
        }
      >
        {openIncidents.length === 0 && !showAllIncidents ? (
          sortedIncidents[0] ? (
            <IncidentSummary i={sortedIncidents[0]} />
          ) : (
            <p className="text-sm text-muted">Açık acil durum yok · henüz kayıt yok.</p>
          )
        ) : (
          <Table head={["Tarih", "Kurye", "Tür", "Not", "Durum"]} empty="Acil durum kaydı yok.">
            {sortedIncidents.map((i) => (
              <tr key={i.id} data-testid={`incident-${i.id}`}>
                <Td className="whitespace-nowrap">{fmtDateTime(i.createdAt)}</Td>
                <Td>{i.courierName}</Td>
                <Td>{INCIDENT_KINDS[i.kind]}</Td>
                <Td className="max-w-sm">{i.note ?? "—"}</Td>
                <Td>
                  {i.resolvedAt ? (
                    <>
                      <span className="text-ink-soft">Kapandı</span>
                      <span className="block text-xs text-muted">{i.resolutionNote}</span>
                    </>
                  ) : (
                    <span className="font-semibold text-red-700">Açık</span>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Drawer open={formOpen} onClose={() => setFormOpen(false)} title="Yeni kurye" description="Kurye bu numarayla SMS koduyla giriş yapar." testId="courier-drawer">
        <form onSubmit={add} className="space-y-3">
          <Input label="Ad Soyad" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          <Input label="Cep telefonu" placeholder="05xx xxx xx xx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          <Input label="Plaka" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} required />
          <Input label="Motor modeli" value={form.vehicleModel} onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })} />
          <ErrorText>{formError}</ErrorText>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Ekleniyor…" : "Kurye ekle"}
          </Button>
        </form>
      </Drawer>
    </>
  );
}

/** One line when nothing is open: the latest record with its resolution */
function IncidentSummary({ i }: { i: Incident }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid={`incident-${i.id}`}>
      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
        Açık acil durum yok
      </span>
      <span className="text-muted">
        · son kayıt {fmtDateTime(i.createdAt)} · {i.courierName ?? "Kurye"} · {INCIDENT_KINDS[i.kind]}
        {i.resolutionNote ? ` — ${i.resolutionNote}` : ""}
      </span>
    </p>
  );
}

const TIER_TONE: Record<PerformanceTier, string> = {
  altin: "bg-amber-100 text-amber-800",
  gumus: "bg-slate-200 text-slate-700",
  gelismeli: "bg-orange-100 text-orange-800",
  riskli: "bg-red-100 text-red-800",
  yeni: "bg-sky-50 text-sky-700",
};

/** Puan + kademe; tıklanınca bileşenler */
function PerformanceCell({ stats, courierId }: { stats: Parameters<typeof courierPerformance>[0] | undefined; courierId: string }) {
  if (!stats) return <span className="text-xs text-muted">—</span>;
  const p = courierPerformance(stats);
  return (
    <details data-testid={`perf-${courierId}`}>
      <summary className="cursor-pointer list-none">
        <span className="font-semibold">{p.score ?? "—"}</span>{" "}
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${TIER_TONE[p.tier]}`}>{PERFORMANCE_TIERS[p.tier]}</span>
      </summary>
      <ul className="mt-1 space-y-0.5 text-xs text-muted">
        {p.parts.map((x) => (
          <li key={x.key}>
            {x.label}: {x.value == null ? "az veri" : `%${Math.round(x.value * 100)}`} · {x.detail}
          </li>
        ))}
      </ul>
    </details>
  );
}
