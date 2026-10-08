"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, ErrorText, Input, PageHeader, Select, Table, Td } from "@/components/ui";
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

function Leads() {
  const { data, error, reload } = useLoad(() => repo.listLeads());
  const update = (id: string, patch: Parameters<typeof repo.updateLead>[1]) => repo.updateLead(id, patch).then(reload);
  return (
    <>
      <ErrorText>{error}</ErrorText>
      <Table head={["Tarih", "Başvuru", "İletişim", "Aylık", "Mesaj", "Durum", "Not"]} empty="Henüz başvuru yok">
        {(data ?? []).map((l: Lead) => (
          <tr key={l.id} data-testid={`lead-${l.id}`}>
            <Td className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</Td>
            <Td>
              <div className="font-semibold">{l.companyName ?? l.contactName}</div>
              <div className="text-xs text-slate-500">{l.kind === "kurumsal" ? `Kurumsal · ${l.contactName}` : "İletişim formu"}</div>
            </Td>
            <Td className="whitespace-nowrap">
              {tel(l.phone)}
              {l.email ? <div className="text-xs">{l.email}</div> : null}
            </Td>
            <Td>{l.monthlyVolume ?? "—"}</Td>
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
    </>
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
      actions={<span className="text-xs text-slate-500">{fmtDateTime(a.createdAt)}</span>}
    >
      <div data-testid={`application-${a.id}`} className="grid gap-3 text-sm md:grid-cols-2">
        <dl className="grid grid-cols-[120px_1fr] gap-x-2 gap-y-1">
          <dt className="text-slate-500">Telefon</dt>
          <dd>{tel(a.phone)}</dd>
          <dt className="text-slate-500">İlçe</dt>
          <dd>{a.district ?? "—"}</dd>
          <dt className="text-slate-500">Yaş</dt>
          <dd>{age ?? "—"}</dd>
          <dt className="text-slate-500">Ehliyet</dt>
          <dd>{a.licenseClass ?? "—"}</dd>
          <dt className="text-slate-500">Motosiklet</dt>
          <dd>{a.hasMotorcycle ? [a.plate, a.vehicleModel].filter(Boolean).join(" · ") || "Var" : "Yok"}</dd>
          <dt className="text-slate-500">Deneyim</dt>
          <dd>{a.experienceYears != null ? `${a.experienceYears} yıl` : "—"}</dd>
          <dt className="text-slate-500">Çalışma</dt>
          <dd>{a.availability ? AVAIL[a.availability] : "—"}</dd>
        </dl>
        <div className="space-y-2">
          {a.message ? <p className="rounded-lg bg-slate-50 p-2">{a.message}</p> : null}
          <div className="flex flex-wrap gap-2">
            {a.documents.length === 0 ? <span className="text-slate-500">Belge yüklenmemiş</span> : null}
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

function Applications() {
  const { data, error, reload } = useLoad(() => repo.listCourierApplications());
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
      <div className="grid gap-4">
        {list.length === 0 ? <p className="text-sm text-slate-500">Bekleyen kurye başvurusu yok.</p> : null}
        {list.map((a) => (
          // Durum değişince kart sıfırlanır (form alanları güncel veriden gelsin)
          <ApplicationCard key={`${a.id}:${a.status}`} a={a} onChange={reload} onApproved={() => setApproved((x) => [...x, a.id])} />
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">KVKK: işe alınmayan başvurular ve belgeleri 1 yıl sonra silinmelidir.</p>
    </>
  );
}

export default function BasvurularPage() {
  const [tab, setTab] = useState<"musteri" | "kurye">("musteri");
  return (
    <>
      <PageHeader title="Başvurular" subtitle="Web sitesinden gelen kurumsal hesap / iletişim başvuruları ve kurye başvuruları." />
      <div className="mb-4 flex gap-2" role="tablist">
        <Button role="tab" aria-selected={tab === "musteri"} variant={tab === "musteri" ? "primary" : "secondary"} onClick={() => setTab("musteri")}>
          Müşteri başvuruları
        </Button>
        <Button role="tab" aria-selected={tab === "kurye"} variant={tab === "kurye" ? "primary" : "secondary"} onClick={() => setTab("kurye")}>
          Kurye başvuruları
        </Button>
      </div>
      {tab === "musteri" ? <Leads /> : <Applications />}
    </>
  );
}
