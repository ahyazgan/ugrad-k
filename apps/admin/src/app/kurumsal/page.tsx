"use client";

import { formatTL } from "@yazgan/shared";
import { useState, type FormEvent } from "react";
import { Button, Card, ErrorText, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { downloadCsv, kurusToCsv } from "@/lib/csv";
import { fmtDateTime, istDate } from "@/lib/dates";
import { repo, type CorporateAccount, type MonthlyStatement } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const EMPTY: Omit<CorporateAccount, "id"> = {
  companyName: "",
  taxOffice: "",
  taxNumber: "",
  billingAddress: "",
  billingEmail: "",
  notes: "",
};

export default function KurumsalPage() {
  const { data: accounts, error, reload } = useLoad(() => repo.listCorporateAccounts());
  const [editing, setEditing] = useState<(Omit<CorporateAccount, "id"> & { id?: string }) | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [month, setMonth] = useState(istDate().slice(0, 7));
  const [statement, setStatement] = useState<MonthlyStatement | null>(null);
  const [stmtError, setStmtError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    try {
      await repo.saveCorporateAccount(editing);
      setEditing(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Kaydedilemedi");
    }
  }

  async function loadStatement() {
    setStmtError(null);
    try {
      setStatement(await repo.monthlyStatement(accountId, month));
    } catch (err) {
      setStmtError(err instanceof Error ? err.message : "Hesaplanamadı");
    }
  }

  function exportStatement() {
    if (!statement) return;
    const inv = statement.invoice;
    downloadCsv(`ekstre_${statement.account.companyName}_${statement.month}.csv`, [
      [statement.account.companyName, statement.account.taxOffice, statement.account.taxNumber],
      ["Sipariş No", "Teslim", "Alış", "Teslim adresi", "KDV hariç"],
      ...statement.orders.map((o) => [o.orderNo, fmtDateTime(o.deliveredAt), o.pickupAddress, o.dropoffAddress, kurusToCsv(o.subtotalKurus)]),
      [],
      ["Teslimat sayısı", inv.deliveryCount],
      ["Brüt (KDV hariç)", kurusToCsv(inv.grossSubtotalKurus)],
      [`İndirim %${inv.discountPct}`, kurusToCsv(-inv.discountKurus)],
      ["Ara toplam", kurusToCsv(inv.subtotalKurus)],
      ["KDV", kurusToCsv(inv.vatKurus)],
      ["Genel toplam", kurusToCsv(inv.totalKurus)],
    ]);
  }

  const field = (key: keyof typeof EMPTY, label: string, required = false) => (
    <Input
      label={label}
      required={required}
      value={(editing?.[key] as string) ?? ""}
      onChange={(e) => setEditing((cur) => ({ ...(cur ?? EMPTY), [key]: e.target.value }))}
    />
  );

  return (
    <>
      <PageHeader
        title="Kurumsal hesaplar"
        subtitle="Ayda 20+ teslimatta %15, 50+ teslimatta %25 indirim ay sonu faturada uygulanır."
        actions={<Button onClick={() => setEditing({ ...EMPTY })}>Yeni hesap</Button>}
      />
      <ErrorText>{error}</ErrorText>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Table head={["Firma", "Vergi", "Fatura e-posta", ""]}>
            {(accounts ?? []).map((a) => (
              <tr key={a.id}>
                <Td className="font-semibold">{a.companyName}</Td>
                <Td>
                  {a.taxOffice} {a.taxNumber}
                </Td>
                <Td>{a.billingEmail}</Td>
                <Td>
                  <Button variant="ghost" onClick={() => setEditing(a)}>
                    Düzenle
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>

          <Card title="Aylık ekstre ve fatura önizleme">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-60 flex-1">
                <Select label="Hesap" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">Seçin…</option>
                  {(accounts ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.companyName}
                    </option>
                  ))}
                </Select>
              </div>
              <Input label="Ay" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
              <Button disabled={!accountId} onClick={loadStatement}>
                Hesapla
              </Button>
              {statement ? (
                <Button variant="secondary" onClick={exportStatement}>
                  CSV indir
                </Button>
              ) : null}
            </div>
            <ErrorText>{stmtError}</ErrorText>
            {statement ? (
              <div className="mt-4 space-y-4">
                <dl className="grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-slate-500">Teslimat</dt>
                    <dd className="text-lg font-bold">{statement.invoice.deliveryCount}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">İndirim</dt>
                    <dd className="text-lg font-bold">
                      %{statement.invoice.discountPct} ({formatTL(statement.invoice.discountKurus)})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Genel toplam (KDV dahil)</dt>
                    <dd className="text-lg font-bold">{formatTL(statement.invoice.totalKurus)}</dd>
                  </div>
                </dl>
                <Table head={["Sipariş", "Teslim", "Güzergâh", "KDV hariç"]} empty="Bu ay teslim edilen sipariş yok">
                  {statement.orders.map((o) => (
                    <tr key={o.id}>
                      <Td>{o.orderNo}</Td>
                      <Td className="whitespace-nowrap">{fmtDateTime(o.deliveredAt)}</Td>
                      <Td className="max-w-xs truncate">
                        {o.pickupAddress} → {o.dropoffAddress}
                      </Td>
                      <Td>{formatTL(o.subtotalKurus)}</Td>
                    </tr>
                  ))}
                </Table>
              </div>
            ) : null}
          </Card>
        </div>

        {editing ? (
          <Card title={editing.id ? "Hesabı düzenle" : "Yeni kurumsal hesap"}>
            <form onSubmit={save} className="space-y-3">
              {field("companyName", "Firma unvanı", true)}
              {field("taxOffice", "Vergi dairesi")}
              {field("taxNumber", "Vergi no / TCKN")}
              {field("billingAddress", "Fatura adresi")}
              {field("billingEmail", "Fatura e-posta")}
              {field("notes", "Not")}
              <ErrorText>{formError}</ErrorText>
              <div className="flex gap-2">
                <Button type="submit">Kaydet</Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                  Vazgeç
                </Button>
              </div>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}
