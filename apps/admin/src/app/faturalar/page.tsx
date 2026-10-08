"use client";

import { formatTL } from "@yazgan/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Card, Chip, EmptyState, ErrorText, PageHeader, Stat, Table, Td } from "@/components/ui";
import { fmtDateTime, istDate } from "@/lib/dates";
import { repo, type Invoice } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const STATUS: Record<Invoice["status"], [string, string]> = {
  pending: ["Kuyrukta", "bg-amber-100 text-amber-800"],
  processing: ["Gönderiliyor", "bg-sky-100 text-sky-800"],
  issued: ["Kesildi", "bg-emerald-100 text-emerald-800"],
  failed: ["Başarısız", "bg-red-100 text-red-800"],
};
const ORDER: Invoice["status"][] = ["failed", "pending", "processing", "issued"];

export default function FaturalarPage() {
  const { data, error, reload } = useLoad(() => repo.listInvoices());
  const [filter, setFilter] = useState<Invoice["status"] | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const month = istDate().slice(0, 7);

  const all = useMemo(() => data ?? [], [data]);
  const failed = all.filter((i) => i.status === "failed");
  const queued = all.filter((i) => i.status === "pending" || i.status === "processing");
  const issuedThisMonth = all.filter((i) => i.status === "issued" && i.issuedAt && istDate(i.issuedAt).startsWith(month));
  // Failed ones first, then newest first
  const rows = useMemo(
    () =>
      all
        .filter((i) => !filter || i.status === filter)
        .sort(
          (a, b) =>
            Number(b.status === "failed") - Number(a.status === "failed") || (b.issuedAt ?? b.createdAt).localeCompare(a.issuedAt ?? a.createdAt),
        ),
    [all, filter],
  );
  const sum = (xs: Invoice[]) => xs.reduce((t, i) => t + i.totalKurus, 0);

  async function retryFailed() {
    setRetrying(true);
    setMsg(null);
    setRetryError(null);
    try {
      for (const i of failed) await repo.retryInvoice(i.id);
      setMsg(`${failed.length} fatura yeniden kuyruğa alındı.`);
      reload();
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : "Yeniden denenemedi");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Faturalar"
        subtitle="Bireysel teslimatlar otomatik faturalanır; kurumsal hesaplar için ay sonu faturası Kurumsal sayfasından oluşturulur."
        actions={
          failed.length ? (
            <Button variant="danger" onClick={retryFailed} disabled={retrying} data-testid="retry-failed">
              {retrying ? "Deneniyor…" : `Başarısızları yeniden dene (${failed.length})`}
            </Button>
          ) : null
        }
      />
      <ErrorText>{error}</ErrorText>
      <ErrorText>{retryError}</ErrorText>
      {msg ? <p className="mb-3 rounded-control bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p> : null}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Bu ay kesilen" value={data ? formatTL(sum(issuedThisMonth)) : "…"} hint={data ? `${issuedThisMonth.length} fatura · KDV dahil` : undefined} />
        <Stat
          label="Kuyrukta"
          value={data ? queued.length : "…"}
          hint={data ? `${formatTL(sum(queued))} · dakikada bir gönderilir` : undefined}
          onClick={() => setFilter(filter === "pending" ? null : "pending")}
          pressed={filter === "pending"}
        />
        <Stat
          label="Başarısız"
          value={data ? failed.length : "…"}
          tone={failed.length ? "critical" : "default"}
          hint={failed.length ? "Hata nedenini kontrol edip yeniden deneyin" : "Sorun yok"}
          onClick={() => setFilter(filter === "failed" ? null : "failed")}
          pressed={filter === "failed"}
        />
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Chip active={!filter} onClick={() => setFilter(null)} count={all.length}>
            Tümü
          </Chip>
          {ORDER.map((s) => (
            <Chip key={s} active={filter === s} onClick={() => setFilter(s)} count={all.filter((i) => i.status === s).length} tone={s === "failed" ? "critical" : s === "pending" ? "warn" : "default"}>
              {STATUS[s][0]}
            </Chip>
          ))}
        </div>
        <Table
          head={["Tarih", "Tür", "Alıcı", "Açıklama", "Tutar", "Durum", ""]}
          num={[4]}
          empty={
            filter ? (
              "Bu durumda fatura yok."
            ) : (
              <EmptyState sticker="fis" title="Henüz fatura yok." description="Teslimattan sonra e-arşiv otomatik kesilir." />
            )
          }
        >
          {rows.map((i) => {
            const [label, tone] = STATUS[i.status];
            return (
              <tr key={i.id} className={i.status === "failed" ? "bg-red-50/50" : undefined}>
                <Td className="whitespace-nowrap">{fmtDateTime(i.issuedAt ?? i.createdAt)}</Td>
                <Td className="whitespace-nowrap">
                  {i.kind === "monthly" ? `Aylık ${i.period}` : "Sipariş"}
                  {i.docType ? <div className="text-xs text-muted">{i.docType === "e_fatura" ? "e-Fatura" : "e-Arşiv"}</div> : null}
                </Td>
                <Td>{i.buyerName}</Td>
                <Td className="max-w-xs">
                  {i.orderId ? (
                    <Link className="text-brand underline underline-offset-2" href={`/siparisler/${i.orderId}`}>
                      {i.description}
                    </Link>
                  ) : (
                    i.description
                  )}
                  {i.lastError ? <div className="text-xs text-red-700">{i.lastError}</div> : null}
                </Td>
                <Td num className="font-semibold">
                  {formatTL(i.totalKurus)}
                </Td>
                <Td>
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
                  {i.attempts > 1 ? <div className="mt-0.5 text-[11px] text-muted">{i.attempts} deneme</div> : null}
                </Td>
                <Td className="whitespace-nowrap text-right">
                  {i.pdfUrl ? (
                    <a className="font-semibold text-brand underline underline-offset-2" href={i.pdfUrl} target="_blank" rel="noreferrer">
                      PDF
                    </a>
                  ) : i.status === "failed" ? (
                    <Button variant="ghost" size="sm" onClick={() => repo.retryInvoice(i.id).then(reload)}>
                      Yeniden dene
                    </Button>
                  ) : null}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
