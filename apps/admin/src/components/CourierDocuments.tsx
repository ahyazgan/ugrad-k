"use client";

import { COURIER_DOCUMENT_TYPES, courierCompliance, type Compliance, type CourierDocumentKind, type DocumentState } from "@yazgan/shared";
import { useState } from "react";
import { Button, Card, ErrorText, Input } from "@/components/ui";
import { repo, type CourierDocumentRecord } from "@/lib/repo";

const STATE: Record<DocumentState, { label: string; cls: string }> = {
  gecerli: { label: "Geçerli", cls: "bg-emerald-50 text-emerald-700" },
  yaklasiyor: { label: "Süresi yaklaşıyor", cls: "bg-amber-50 text-amber-800" },
  suresi_doldu: { label: "Süresi dolmuş", cls: "bg-red-50 text-red-700" },
  eksik: { label: "Eksik", cls: "bg-slate-100 text-slate-600" },
};

export function complianceOf(docs: CourierDocumentRecord[], warnDays: number): Compliance {
  return courierCompliance(docs, new Date(), warnDays);
}

/** Kurye listesinde tek bakışta belge durumu */
export function ComplianceBadge({ c }: { c: Compliance }) {
  if (c.blocking.length) {
    return (
      <span className="whitespace-nowrap rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700" title={c.blocking.map((b) => b.label).join(", ")}>
        {c.blocking.length} belge eksik
      </span>
    );
  }
  if (c.warnings.length) {
    return (
      <span className="whitespace-nowrap rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800" title={c.warnings.map((b) => b.label).join(", ")}>
        {c.warnings.length} belge yaklaşıyor
      </span>
    );
  }
  return <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Tamam</span>;
}

function DocumentRow({
  courierId,
  kind,
  record,
  item,
  onSaved,
}: {
  courierId: string;
  kind: CourierDocumentKind;
  record: CourierDocumentRecord | undefined;
  item: Compliance["items"][number];
  onSaved: () => void;
}) {
  const type = COURIER_DOCUMENT_TYPES.find((t) => t.kind === kind)!;
  const [docNumber, setDocNumber] = useState(record?.docNumber ?? "");
  const [expiresAt, setExpiresAt] = useState(record?.expiresAt ?? "");
  const [note, setNote] = useState(record?.note ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = STATE[item.state];

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await repo.saveCourierDocument(
        { courierId, kind, docNumber: docNumber.trim() || null, expiresAt: type.expires ? expiresAt || null : null, note: note.trim() || null },
        file,
      );
      setFile(null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-slate-100 py-3 first:border-t-0" data-testid={`doc-${kind}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-semibold">{type.label}</span>
        {type.required ? <span className="text-xs text-muted">zorunlu</span> : null}
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${state.cls}`}>
          {state.label}
          {item.daysLeft != null && item.daysLeft >= 0 ? ` · ${item.daysLeft} gün` : ""}
        </span>
        {record?.filePath ? (
          <button
            className="text-xs text-brand underline"
            onClick={() => repo.courierDocumentUrl(record.filePath!).then((u) => u && window.open(u, "_blank"))}
          >
            Dosyayı aç
          </button>
        ) : null}
      </div>
      <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Input label="Belge no" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
        {type.expires ? (
          <Input label="Bitiş tarihi" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} data-testid={`expires-${kind}`} />
        ) : (
          <Input label="Not" value={note} onChange={(e) => setNote(e.target.value)} />
        )}
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Dosya (isteğe bağlı)</span>
          <input type="file" accept="image/*,application/pdf" className="text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="flex gap-1">
          <Button onClick={save} disabled={busy || (type.expires && !expiresAt)} data-testid={`save-${kind}`}>
            Kaydet
          </Button>
          {record ? (
            <Button variant="ghost" disabled={busy} onClick={() => repo.deleteCourierDocument(courierId, kind).then(onSaved)}>
              Sil
            </Button>
          ) : null}
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

export function CourierDocumentsCard({
  courierId,
  name,
  docs,
  warnDays,
  onSaved,
}: {
  courierId: string;
  name: string;
  docs: CourierDocumentRecord[];
  warnDays: number;
  onSaved: () => void;
}) {
  const c = complianceOf(docs, warnDays);
  return (
    <Card title={`${name}: belgeler`} className="mt-6">
      <p className="mb-2 text-sm text-slate-600">
        {c.ok
          ? "Zorunlu belgeler tamam."
          : `Vardiyaya giremez ve otomatik iş almaz: ${c.blocking.map((b) => b.label).join(", ")}.`}{" "}
        Başvurudan gelen belgeler Başvurular sayfasında görülebilir.
      </p>
      {COURIER_DOCUMENT_TYPES.map((t) => (
        <DocumentRow
          key={`${t.kind}-${docs.find((d) => d.kind === t.kind)?.updatedAt ?? "yok"}`}
          courierId={courierId}
          kind={t.kind}
          record={docs.find((d) => d.kind === t.kind)}
          item={c.items.find((i) => i.kind === t.kind)!}
          onSaved={onSaved}
        />
      ))}
    </Card>
  );
}
