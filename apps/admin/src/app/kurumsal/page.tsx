"use client";

import { formatTL, type CorporateTier } from "@yazgan/shared";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ApiAccess } from "@/components/ApiAccess";
import { Button, buttonClass, Card, Drawer, EmptyState, ErrorText, Input, PageHeader, Select, Table, Td } from "@/components/ui";
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

const prevMonthOf = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const monthLabel = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("tr-TR", { month: "long", year: "numeric", timeZone: "Europe/Istanbul" });

/** "Ayda 20+ teslimatta %15, 50+ teslimatta %25" from the live pricing settings */
const tiersText = (tiers: CorporateTier[]) =>
  tiers.length
    ? `Ayda ${tiers.map((t) => `${t.minDeliveries}+ teslimatta %${t.discountPct}`).join(", ")} indirim ay sonu faturada uygulanır.`
    : "Kurumsal kademe indirimi tanımlı değil (Fiyatlar).";

export default function KurumsalPage() {
  const thisMonth = istDate().slice(0, 7);
  const prevMonth = prevMonthOf(thisMonth);
  const { data: accounts, error, reload } = useLoad(() => repo.listCorporateAccounts());
  // Tier progress (this month) and last month's unbilled accounts, from existing statement/invoice calls
  const overview = useLoad(async () => {
    const [list, pricing, invoices] = await Promise.all([repo.listCorporateAccounts(), repo.getPricing(), repo.listInvoices()]);
    const tiers = [...pricing.settings.corporateTiers].sort((a, b) => a.minDeliveries - b.minDeliveries);
    const rows = await Promise.all(
      list.map(async (a) => {
        const [cur, prev] = await Promise.all([repo.monthlyStatement(a.id, thisMonth), repo.monthlyStatement(a.id, prevMonth)]);
        const billed = invoices.some((i) => i.kind === "monthly" && i.corporateAccountId === a.id && i.period === prevMonth);
        return { account: a, count: cur.invoice.deliveryCount, pct: cur.invoice.discountPct, prevCount: prev.invoice.deliveryCount, prevTotal: prev.invoice.totalKurus, billed };
      }),
    );
    return { tiers, rows: rows.sort((a, b) => b.count - a.count) };
  }, [thisMonth]);

  const [editing, setEditing] = useState<(Omit<CorporateAccount, "id"> & { id?: string }) | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [month, setMonth] = useState(thisMonth);
  const [statement, setStatement] = useState<MonthlyStatement | null>(null);
  const [stmtError, setStmtError] = useState<string | null>(null);
  const [stmtMsg, setStmtMsg] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    try {
      await repo.saveCorporateAccount(editing);
      setEditing(null);
      reload();
      overview.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Kaydedilemedi");
    }
  }

  async function loadStatement(id = accountId, m = month) {
    setStmtError(null);
    setStmtMsg(null);
    try {
      setStatement(await repo.monthlyStatement(id, m));
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

  const tiers = overview.data?.tiers ?? [];
  const top = tiers.at(-1)?.minDeliveries ?? 0;
  const unbilled = (overview.data?.rows ?? []).filter((r) => r.prevCount > 0 && !r.billed);

  return (
    <>
      <PageHeader
        title="Kurumsal hesaplar"
        subtitle={overview.data ? tiersText(tiers) : "Kurumsal kademe indirimi ay sonu faturada uygulanır."}
        actions={<Button onClick={() => setEditing({ ...EMPTY })}>+ Yeni hesap</Button>}
      />
      <ErrorText>{error}</ErrorText>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={`Hesaplar${accounts ? ` · ${accounts.length}` : ""}`}>
            <Table
              head={["Firma", "Vergi", "Fatura e-posta", ""]}
              empty={
                <EmptyState
                  sticker="bina"
                  title="Henüz kurumsal hesap yok."
                  description="Web sitesinden gelen başvurular Başvurular sayfasında."
                  action={
                    <>
                      <Link href="/basvurular" className={buttonClass("secondary", "sm")}>
                        Başvurulara git
                      </Link>
                      <Button size="sm" onClick={() => setEditing({ ...EMPTY })}>
                        Hesap aç
                      </Button>
                    </>
                  }
                />
              }
            >
              {(accounts ?? []).map((a) => (
                <tr key={a.id}>
                  <Td className="font-semibold">
                    {a.companyName}
                    {a.notes ? <div className="text-xs font-normal text-muted">{a.notes}</div> : null}
                  </Td>
                  <Td>
                    {a.taxOffice} {a.taxNumber}
                  </Td>
                  <Td>{a.billingEmail}</Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>
                      Düzenle
                    </Button>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>

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
              <Button disabled={!accountId} onClick={() => loadStatement()}>
                Hesapla
              </Button>
              {statement ? (
                <>
                  <Button variant="secondary" onClick={exportStatement}>
                    CSV indir
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!statement.orders.length}
                    onClick={async () => {
                      setStmtError(null);
                      setStmtMsg(null);
                      try {
                        await repo.createMonthlyInvoice(statement.account.id, statement.month);
                        setStmtMsg("Fatura kuyruğa alındı. Faturalar sayfasından takip edebilirsiniz.");
                        overview.reload();
                      } catch (err) {
                        setStmtError(err instanceof Error ? err.message : "Fatura oluşturulamadı");
                      }
                    }}
                  >
                    Faturayı oluştur
                  </Button>
                </>
              ) : null}
            </div>
            <div className="mt-2">
              <ErrorText>{stmtError}</ErrorText>
            </div>
            {stmtMsg ? <p className="mt-2 text-sm text-emerald-700">{stmtMsg}</p> : null}
            {statement ? (
              <div className="mt-4 space-y-4">
                <dl className="grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted">Teslimat</dt>
                    <dd className="text-lg font-bold tabular-nums">{statement.invoice.deliveryCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">İndirim</dt>
                    <dd className="text-lg font-bold tabular-nums">
                      %{statement.invoice.discountPct} ({formatTL(statement.invoice.discountKurus)})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Genel toplam (KDV dahil)</dt>
                    <dd className="text-lg font-bold tabular-nums">{formatTL(statement.invoice.totalKurus)}</dd>
                  </div>
                </dl>
                <Table head={["Sipariş", "Teslim", "Güzergâh", "KDV hariç"]} num={[3]} empty="Bu ay teslim edilen sipariş yok.">
                  {statement.orders.map((o) => (
                    <tr key={o.id}>
                      <Td>{o.orderNo}</Td>
                      <Td className="whitespace-nowrap">{fmtDateTime(o.deliveredAt)}</Td>
                      <Td className="max-w-xs truncate">
                        {o.pickupAddress} → {o.dropoffAddress}
                      </Td>
                      <Td num>{formatTL(o.subtotalKurus)}</Td>
                    </tr>
                  ))}
                </Table>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">Hesap ve ay seçip “Hesapla”ya basın; teslimatlar, kademe indirimi ve genel toplam burada görünür.</p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Bu ay kademe durumu" actions={<span className="text-xs text-muted">{monthLabel(thisMonth)}</span>}>
            {!overview.data ? (
              <p className="text-sm text-muted">Yükleniyor…</p>
            ) : overview.data.rows.length === 0 ? (
              <p className="text-sm text-muted">Kurumsal hesap eklenince teslimat sayıları burada izlenir.</p>
            ) : (
              <ul className="space-y-4" data-testid="tier-progress">
                {overview.data.rows.map((r) => {
                  const nextTier = tiers.find((t) => r.count < t.minDeliveries);
                  const width = top ? Math.min(100, (r.count / top) * 100) : 0;
                  return (
                    <li key={r.account.id}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-semibold">{r.account.companyName}</span>
                        <span className="shrink-0 tabular-nums text-ink-soft">
                          {r.count} teslimat{r.pct ? <b className="ml-1.5 rounded bg-brand-light px-1.5 py-0.5 text-xs text-brand">%{r.pct}</b> : null}
                        </span>
                      </div>
                      <div
                        className="relative mt-1.5 h-2 rounded-full bg-canvas"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={top}
                        aria-valuenow={Math.min(r.count, top)}
                        title={`${r.account.companyName}: ${r.count}/${top}`}
                      >
                        <div className="h-2 rounded-full bg-brand" style={{ width: `${width}%` }} />
                        {tiers.map((t) => (
                          <span
                            key={t.minDeliveries}
                            className="absolute -top-0.5 h-3 w-0.5 rounded bg-muted/60"
                            style={{ left: `${top ? (t.minDeliveries / top) * 100 : 0}%` }}
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {nextTier
                          ? `%${nextTier.discountPct} kademesine ${nextTier.minDeliveries - r.count} teslimat kaldı`
                          : tiers.length
                            ? "En üst kademede"
                            : "Kademe tanımlı değil"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            {tiers.length ? (
              <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
                Eşikler: {tiers.map((t) => `${t.minDeliveries} teslimat → %${t.discountPct}`).join(" · ")} (Fiyatlar sayfasından değişir)
              </p>
            ) : null}
          </Card>

          <Card title="Ay sonu faturası kesilmemiş hesaplar" actions={<span className="text-xs text-muted">{monthLabel(prevMonth)}</span>}>
            {!overview.data ? (
              <p className="text-sm text-muted">Yükleniyor…</p>
            ) : unbilled.length === 0 ? (
              <p className="text-sm text-muted">Geçen ayın tüm kurumsal faturaları oluşturulmuş.</p>
            ) : (
              <ul className="divide-y divide-line" data-testid="unbilled">
                {unbilled.map((r) => (
                  <li key={r.account.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.account.companyName}</div>
                      <div className="text-xs tabular-nums text-muted">
                        {r.prevCount} teslimat · {formatTL(r.prevTotal)} (KDV dahil)
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="shrink-0 whitespace-nowrap"
                      onClick={() => {
                        setAccountId(r.account.id);
                        setMonth(prevMonth);
                        void loadStatement(r.account.id, prevMonth);
                      }}
                    >
                      Ekstreyi aç
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <div className="mt-6">
        <ApiAccess accounts={accounts ?? []} />
      </div>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Hesabı düzenle" : "Yeni kurumsal hesap"}
        description="Fatura bilgileri ay sonu e-faturasında kullanılır."
        testId="corporate-drawer"
      >
        <form onSubmit={save} className="space-y-3">
          {field("companyName", "Firma unvanı", true)}
          {field("taxOffice", "Vergi dairesi")}
          {field("taxNumber", "Vergi no / TCKN")}
          {field("billingAddress", "Fatura adresi")}
          {field("billingEmail", "Fatura e-posta")}
          {field("notes", "Not")}
          <ErrorText>{formError}</ErrorText>
          <div className="flex gap-2 pt-2">
            <Button type="submit">Kaydet</Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Vazgeç
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
