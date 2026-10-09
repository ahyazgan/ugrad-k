"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Chip, cx, EmptyState, ErrorText, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { repo, type ApplicationStatus, type CourierApplication, type Lead, type LeadStatus } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const LEAD_STATUS: Record<LeadStatus, [string, string]> = {
  yeni: ["Yeni", "bg-amber-100 text-amber-800"],
  arandi: ["Arandı", "bg-sky-100 text-sky-800"],
  kazanildi: ["Müşteri oldu", "bg-emerald-100 text-emerald-800"],
  kaybedildi: ["Olumsuz", "bg-slate-100 text-slate-600"],
};
const APP_STATUS: Record<ApplicationStatus, [string, string]> = {
  yeni: ["Yeni", "bg-amber-100 text-amber-800"],
  gorusme: ["Görüşme", "bg-sky-100 text-sky-800"],
  onaylandi: ["Kurye oldu", "bg-emerald-100 text-emerald-800"],
  reddedildi: ["Reddedildi", "bg-slate-100 text-slate-600"],
};
const DOCS: Record<string, string> = {
  ehliyet_on: "Ehliyet (ön)",
  ehliyet_arka: "Ehliyet (arka)",
  ruhsat: "Ruhsat",
  vesikalik: "Vesikalık",
};
const AVAIL: Record<string, string> = { tam_zamanli: "Tam zamanlı", yari_zamanli: "Yarı zamanlı", hafta_sonu: "Hafta sonu" };
const tel = (p: string) => <a className="text-brand underline" href={`tel:${p}`}>{p}</a>;
const Badge = ({ tone, children }: { tone: string; children: string }) => (
  <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{children}</span>
);

function NoteField({ value, onSave }: { value: string | null; onSave: (v: string | null) => Promise<void> }) {
  const [v, setV] = useState(value ?? "");
  return (
    <Input
      aria-label="Not"
      placeholder="Not ekle…"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== (value ?? "") && onSave(v.trim() || null)}
      className="min-w-48 py-1"
    />
  );
}

function Leads({ onChange }: { onChange: () => void }) {
  const { data, error, reload } = useLoad(() => repo.listLeads());
  const [filter, setFilter] = useState<LeadStatus | null>(null);
  const update = (id: string, patch: Parameters<typeof repo.updateLead>[1]) =>
    repo.updateLead(id, patch).then(() => {
      reload();
      onChange();
    });
  const all = data ?? [];
  const list = all.filter((l) => !filter || l.status === filter);
  return (
    <Card>
      <ErrorText>{error}</ErrorText>
      {/* Status summary doubles as a filter */}
      <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="lead-summary">
        <Chip active={!filter} onClick={() => setFilter(null)} count={all.length}>
          Tümü
        </Chip>
        {(Object.keys(LEAD_STATUS) as LeadStatus[]).map((k) => (
          <Chip key={k} active={filter === k} onClick={() => setFilter(k)} count={all.filter((l) => l.status === k).length} tone={k === "yeni" ? "warn" : "default"}>
            {LEAD_STATUS[k][0]}
          </Chip>
        ))}
      </div>
      <Table
        head={["Tarih", "Başvuru", "İletişim", "Aylık", "Mesaj", "Durum", "Not"]}
        empty={
          filter ? (
            "Bu durumda başvuru yok."
          ) : (
            <EmptyState
              sticker="bina"
              title="Henüz başvuru yok"
              description="Web sitesindeki kurumsal başvuru ve iletişim formlarından gelenler burada listelenir."
            />
          )
        }
      >
        {list.map((l: Lead) => (
          <tr key={l.id} data-testid={`lead-${l.id}`}>
            <Td className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</Td>
            <Td>
              <div className="font-semibold">{l.companyName ?? l.contactName}</div>
              <div className="text-xs text-muted">{l.kind === "kurumsal" ? `Kurumsal · ${l.contactName}` : "İletişim formu"}</div>
            </Td>
            <Td className="whitespace-nowrap">
              {tel(l.phone)}
              {l.email ? <div className="text-xs">{l.email}</div> : null}
            </Td>
            <Td className="whitespace-nowrap">{l.monthlyVolume ?? "—"}</Td>
            <Td className="max-w-xs text-sm">{l.message ?? "—"}</Td>
            <Td>
              <Select aria-label="Durum" value={l.status} onChange={(e) => update(l.id, { status: e.target.value as LeadStatus })} className="py-1">
                {Object.entries(LEAD_STATUS).map(([k, [label]]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </Td>
            <Td>
              <NoteField value={l.adminNote} onSave={(adminNote) => update(l.id, { adminNote })} />
            </Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function ApplicationCard({ a, onChange, onApproved }: { a: CourierApplication; onChange: () => void; onApproved: () => void }) {
  const [plate, setPlate] = useState(a.plate ?? "");
  const [model, setModel] = useState(a.vehicleModel ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, tone] = APP_STATUS[a.status];
  const age = a.birthYear ? new Date().getFullYear() - a.birthYear : null;

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      await repo.approveCourierApplication(a.id, { plate: plate.trim().toUpperCase(), vehicleModel: model.trim() || undefined });
      onApproved();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kurye hesabı açılamadı");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {a.fullName} <Badge tone={tone}>{label}</Badge>
        </span>
      }
      actions={<span className="text-xs text-muted">{fmtDateTime(a.createdAt)}</span>}
    >
      <div data-testid={`application-${a.id}`} className="grid gap-3 text-sm md:grid-cols-2">
        <dl className="grid grid-cols-[120px_1fr] gap-x-2 gap-y-1">
          <dt className="text-muted">Telefon</dt>
          <dd>{tel(a.phone)}</dd>
          <dt className="text-muted">İlçe</dt>
          <dd>{a.district ?? "—"}</dd>
          <dt className="text-muted">Yaş</dt>
          <dd>{age ?? "—"}</dd>
          <dt className="text-muted">Ehliyet</dt>
          <dd>{a.licenseClass ?? "—"}</dd>
          <dt className="text-muted">Motosiklet</dt>
          <dd>{a.hasMotorcycle ? [a.plate, a.vehicleModel].filter(Boolean).join(" · ") || "Var" : "Yok"}</dd>
          <dt className="text-muted">Deneyim</dt>
          <dd>{a.experienceYears != null ? `${a.experienceYears} yıl` : "—"}</dd>
          <dt className="text-muted">Çalışma</dt>
          <dd>{a.availability ? AVAIL[a.availability] : "—"}</dd>
        </dl>
        <div className="space-y-2">
          {a.message ? <p className="rounded-lg bg-canvas p-2">{a.message}</p> : null}
          <div className="flex flex-wrap gap-2">
            {a.documents.length === 0 ? <span className="text-muted">Belge yüklenmemiş</span> : null}
            {a.documents.map((d) => (
              <Button
                key={d.path}
                variant="secondary"
                onClick={async () => {
                  const url = await repo.applicationDocumentUrl(d.path);
                  if (url) window.open(url, "_blank", "noopener");
                }}
              >
                {DOCS[d.kind] ?? d.kind}
              </Button>
            ))}
          </div>
          <NoteField value={a.adminNote} onSave={(adminNote) => repo.updateCourierApplication(a.id, { adminNote }).then(onChange)} />
        </div>
      </div>
      {a.status === "onaylandi" ? (
        <p className="mt-3 text-sm text-emerald-700">
          Kurye hesabı açıldı.{" "}
          <Link href="/kuryeler" className="underline">
            Kuryeler
          </Link>
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          {a.status === "yeni" ? (
            <Button variant="secondary" onClick={() => repo.updateCourierApplication(a.id, { status: "gorusme" }).then(onChange)}>
              Görüşmeye al
            </Button>
          ) : null}
          {a.status !== "reddedildi" ? (
            <Button variant="ghost" onClick={() => repo.updateCourierApplication(a.id, { status: "reddedildi" }).then(onChange)}>
              Reddet
            </Button>
          ) : null}
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <Input label="Plaka" value={plate} onChange={(e) => setPlate(e.target.value)} className="w-32" data-testid={`approve-plate-${a.id}`} />
            <Input label="Model" value={model} onChange={(e) => setModel(e.target.value)} className="w-44" />
            <Button onClick={approve} disabled={busy || !plate.trim()} data-testid={`approve-${a.id}`}>
              Kurye hesabı aç
            </Button>
          </div>
          <div className="w-full">
            <ErrorText>{error}</ErrorText>
          </div>
        </div>
      )}
    </Card>
  );
}

function Applications({ onChange }: { onChange: () => void }) {
  const { data: loaded, error, reload: reloadList } = useLoad(() => repo.listCourierApplications());
  const data = loaded;
  const reload = () => {
    reloadList();
    onChange();
  };
  const [showClosed, setShowClosed] = useState(false);
  // Bu oturumda onaylananlar sonuç mesajıyla görünür kalsın
  const [approved, setApproved] = useState<string[]>([]);
  const list = (data ?? []).filter((a) => showClosed || a.status === "yeni" || a.status === "gorusme" || approved.includes(a.id));
  return (
    <>
      <ErrorText>{error}</ErrorText>
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Sonuçlananları da göster
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {data && list.length === 0 ? (
          <Card>
            <EmptyState
              sticker="kask"
              title="Bekleyen kurye başvurusu yok"
              description="Web sitesindeki kurye başvuru formundan gelenler burada; sonuçlananları görmek için yukarıdaki kutuyu işaretleyin."
            />
          </Card>
        ) : null}
        {list.map((a) => (
          // Durum değişince kart sıfırlanır (form alanları güncel veriden gelsin)
          <ApplicationCard key={`${a.id}:${a.status}`} a={a} onChange={reload} onApproved={() => setApproved((x) => [...x, a.id])} />
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">KVKK: işe alınmayan başvurular ve belgeleri 1 yıl sonra silinmelidir.</p>
    </>
  );
}

function TabCount({ n, active }: { n: number | null; active: boolean }) {
  if (!n) return null;
  return (
    <span className={cx("rounded-full px-1.5 text-[11px] font-bold leading-5 tabular-nums", active ? "bg-accent text-brand" : "bg-brand-light text-brand")} title={`${n} yeni`}>
      {n}
    </span>
  );
}

export default function BasvurularPage() {
  const [tab, setTab] = useState<"musteri" | "kurye">("musteri");
  // Tab counters: new (unhandled) items per list
  const counts = useLoad(async () => {
    const [leads, apps] = await Promise.all([repo.listLeads(), repo.listCourierApplications()]);
    return { leads: leads.filter((l) => l.status === "yeni").length, apps: apps.filter((a) => a.status === "yeni").length };
  });
  return (
    <>
      <PageHeader title="Başvurular" subtitle="Web sitesinden gelen kurumsal hesap / iletişim başvuruları ve kurye başvuruları." />
      <div className="mb-4 flex gap-2" role="tablist">
        <Button role="tab" aria-selected={tab === "musteri"} variant={tab === "musteri" ? "primary" : "secondary"} onClick={() => setTab("musteri")}>
          Müşteri başvuruları <TabCount n={counts.data?.leads ?? null} active={tab === "musteri"} />
        </Button>
        <Button role="tab" aria-selected={tab === "kurye"} variant={tab === "kurye" ? "primary" : "secondary"} onClick={() => setTab("kurye")}>
          Kurye başvuruları <TabCount n={counts.data?.apps ?? null} active={tab === "kurye"} />
        </Button>
      </div>
      {tab === "musteri" ? <Leads onChange={counts.reload} /> : <Applications onChange={counts.reload} />}
    </>
  );
}
