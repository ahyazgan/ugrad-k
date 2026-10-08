"use client";

import { useState, type FormEvent } from "react";
import { Button, Card, ErrorText, Input, PageHeader, Table, Td } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

export default function KuryelerPage() {
  const { data, error, reload } = useLoad(() => repo.listCouriers());
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
      <PageHeader title="Kuryeler" subtitle="Kurye, uygulamaya kendi telefon numarasıyla SMS koduyla giriş yapar." />
      <ErrorText>{error}</ErrorText>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Table head={["Kurye", "Plaka / araç", "Durum", "Aktif iş", "Son konum", ""]}>
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
