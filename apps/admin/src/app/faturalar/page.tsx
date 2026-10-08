"use client";

import { formatTL } from "@yazgan/shared";
import Link from "next/link";
import { Button, ErrorText, PageHeader, Table, Td } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { repo, type Invoice } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const STATUS: Record<Invoice["status"], [string, string]> = {
  pending: ["Kuyrukta", "bg-amber-100 text-amber-800"],
  processing: ["Gönderiliyor", "bg-sky-100 text-sky-800"],
  issued: ["Kesildi", "bg-emerald-100 text-emerald-800"],
  failed: ["Başarısız", "bg-red-100 text-red-800"],
};

export default function FaturalarPage() {
  const { data, error, reload } = useLoad(() => repo.listInvoices());
  return (
    <>
      <PageHeader
        title="Faturalar"
        subtitle="Bireysel teslimatlar otomatik faturalanır; kurumsal hesaplar için ay sonu faturası Kurumsal sayfasından oluşturulur."
      />
      <ErrorText>{error}</ErrorText>
      <Table head={["Tarih", "Tür", "Alıcı", "Açıklama", "Tutar", "Durum", ""]} empty="Henüz fatura yok">
        {(data ?? []).map((i) => {
          const [label, tone] = STATUS[i.status];
          return (
            <tr key={i.id}>
              <Td className="whitespace-nowrap">{fmtDateTime(i.issuedAt ?? i.createdAt)}</Td>
              <Td>
                {i.kind === "monthly" ? `Aylık ${i.period}` : "Sipariş"}
                {i.docType ? <div className="text-xs text-slate-500">{i.docType === "e_fatura" ? "e-Fatura" : "e-Arşiv"}</div> : null}
              </Td>
              <Td>{i.buyerName}</Td>
              <Td className="max-w-xs">
                {i.orderId ? (
                  <Link className="text-brand underline" href={`/siparisler/${i.orderId}`}>
                    {i.description}
                  </Link>
                ) : (
                  i.description
                )}
                {i.lastError ? <div className="text-xs text-red-700">{i.lastError}</div> : null}
              </Td>
              <Td className="whitespace-nowrap font-semibold">{formatTL(i.totalKurus)}</Td>
              <Td>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
              </Td>
              <Td className="whitespace-nowrap">
                {i.pdfUrl ? (
                  <a className="text-brand underline" href={i.pdfUrl} target="_blank" rel="noreferrer">
                    PDF
                  </a>
                ) : i.status === "failed" ? (
                  <Button variant="ghost" onClick={() => repo.retryInvoice(i.id).then(reload)}>
                    Yeniden dene
                  </Button>
                ) : null}
              </Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
