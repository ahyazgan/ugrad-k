"use client";

import { COURIER_DOCUMENT_TYPES } from "@yazgan/shared";
import { useState, type FormEvent } from "react";
import { ComplianceBadge, complianceOf, CourierDocumentsCard } from "@/components/CourierDocuments";
import { Button, Card, ErrorText, Input, PageHeader, Table, Td } from "@/components/ui";
import { downloadCsv } from "@/lib/csv";
import { fmtDateTime } from "@/lib/dates";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

export default function KuryelerPage() {
  const { data, error, reload } = useLoad(() => repo.listCouriers());
  const docsLoad = useLoad(() => repo.listCourierDocuments());
  const ops = useLoad(() => repo.getOpsSettings());
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
  const [form, setForm] = useState({ fullName: "", phone: "", plate: "", vehicleModel: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await repo.createCourier(form);
      setForm({ fullName: "", phone: "", plate: "", vehicleModel: "" });
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Eklenemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Kuryeler"
        subtitle="Kurye, uygulamaya kendi telefon numarasıyla SMS koduyla giriş yapar. Zorunlu belgeleri eksik kurye vardiyaya giremez (Otomasyon'dan kapatılabilir)."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!data?.length}>
            Kurye listesi (CSV)
          </Button>
        }
      />
      <ErrorText>{error}</ErrorText>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Table head={["Kurye", "Plaka / araç", "Durum", "Belgeler", "Aktif iş", "Son konum", ""]}>
            {(data ?? []).map((c) => (
              <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                <Td>
                  <div className="font-semibold">{c.fullName}</div>
                  <div className="text-xs text-slate-500">{c.phone}</div>
                </Td>
                <Td>
                  <div>{c.plate}</div>
                  <div className="text-xs text-slate-500">{c.vehicleModel}</div>
                </Td>
                <Td>
                  {!c.active ? "Pasif" : c.isOnShift ? <span className="font-semibold text-emerald-700">Vardiyada</span> : "Vardiya dışı"}
                </Td>
                <Td>
                  <button className="text-left" onClick={() => setSelected(c.id)} data-testid={`docs-${c.id}`}>
                    <ComplianceBadge c={complianceOf(docsOf(c.id), warnDays)} />
                    <span className="mt-0.5 block text-xs text-brand underline">Belgeler</span>
                  </button>
                </Td>
                <Td>{c.activeOrderCount}</Td>
                <Td className="whitespace-nowrap text-xs">
                  {c.lastLat != null && c.lastLng != null ? (
                    <a
                      className="text-brand underline"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://www.google.com/maps?q=${c.lastLat},${c.lastLng}`}
                    >
                      {fmtDateTime(c.lastLocationAt)}
                    </a>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  <Button variant="ghost" onClick={() => repo.updateCourier(c.id, { active: !c.active }).then(reload)}>
                    {c.active ? "Pasifleştir" : "Aktifleştir"}
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
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
        <Card title="Yeni kurye">
          <form onSubmit={add} className="space-y-3">
            <Input label="Ad Soyad" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            <Input
              label="Cep telefonu"
              placeholder="05xx xxx xx xx"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />
            <Input label="Plaka" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} required />
            <Input label="Motor modeli" value={form.vehicleModel} onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })} />
            <ErrorText>{formError}</ErrorText>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Ekleniyor…" : "Kurye ekle"}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
