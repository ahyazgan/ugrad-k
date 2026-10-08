"use client";

import { ORDER_STATUSES, ORDER_STATUS_LABELS, formatTL, type OrderStatus } from "@yazgan/shared";
import Link from "next/link";
import { SlaBadge } from "@/components/SlaBadge";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, ErrorText, Input, PageHeader, Table, Td } from "@/components/ui";
import { downloadCsv, kurusToCsv } from "@/lib/csv";
import { fmtDateTime, istDate } from "@/lib/dates";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const ACTIVE: OrderStatus[] = ["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda", "sorunlu"];

export default function SiparislerPage() {
  const [statuses, setStatuses] = useState<OrderStatus[]>(ACTIVE);
  const [from, setFrom] = useState(() => istDate(new Date(Date.now() - 7 * 86_400_000)));
  const [to, setTo] = useState(istDate());
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const { data, error, loading, reload } = useLoad(
    () => repo.listOrders({ statuses, from, to, search: query || undefined }),
    [statuses.join(), from, to, query],
  );
  useEffect(() => repo.subscribeOrders(reload), [reload]);
  // Acil taahhüt geri sayımı dakikada bir yenilenir
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const toggle = (s: OrderStatus) => setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  function exportCsv() {
    downloadCsv(`siparisler_${from}_${to}.csv`, [
      ["Sipariş No", "Tarih", "Durum", "Müşteri", "Telefon", "Alış", "Teslim", "Kurye", "KDV hariç", "Toplam", "Ödeme"],
      ...(data ?? []).map((o) => [
        o.orderNo,
        fmtDateTime(o.createdAt),
        ORDER_STATUS_LABELS[o.status],
        o.customerName,
        o.customerPhone,
        o.pickupAddress,
        o.dropoffAddress,
        o.courierName,
        kurusToCsv(o.subtotalKurus),
        kurusToCsv(o.totalKurus),
        o.paymentMethod,
      ]),
    ]);
  }

  return (
    <>
      <PageHeader
        title="Siparişler"
        subtitle={loading ? "Yükleniyor…" : `${data?.length ?? 0} sipariş`}
        actions={
          <>
            <Link href="/siparisler/yeni" className="inline-flex items-center rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
              + Telefon siparişi
            </Link>
            <Button variant="secondary" onClick={exportCsv} disabled={!data?.length}>
              CSV indir
            </Button>
          </>
        }
      />
      <div className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {ORDER_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => toggle(s)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                statuses.includes(s) ? "border-brand bg-brand text-white" : "border-slate-300 text-slate-600"
              }`}
            >
              {ORDER_STATUS_LABELS[s]}
            </button>
          ))}
          <button className="text-xs text-brand underline" onClick={() => setStatuses([])}>
            Tümü
          </button>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
          }}
        >
          <Input label="Başlangıç" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Bitiş" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Input label="Ara" placeholder="Sipariş no, adres" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Filtrele
            </Button>
          </div>
        </form>
      </div>
      <ErrorText>{error}</ErrorText>
      <Table head={["No", "Tarih", "Durum", "Müşteri", "Nereden → Nereye", "Kurye", "Tutar"]} empty="Filtreye uyan sipariş yok">
        {(data ?? []).map((o) => (
          <tr key={o.id} className="hover:bg-slate-50">
            <Td>
              <Link className="font-semibold text-brand hover:underline" href={`/siparisler/${o.id}`}>
                {o.orderNo}
              </Link>
              {o.urgent ? <div className="text-xs font-bold text-amber-600">ACİL</div> : null}
              <SlaBadge o={o} now={now} />
              {o.serviceLevel === "ekonomi" ? <div className="text-xs font-bold text-emerald-700">EKONOMİ</div> : null}
              {o.paymentMethod === "kart" && o.paymentStatus === "odenmedi" && o.status !== "iptal" ? (
                <div className="text-xs font-semibold text-red-700">Ödeme bekleniyor</div>
              ) : null}
            </Td>
            <Td className="whitespace-nowrap">{fmtDateTime(o.createdAt)}</Td>
            <Td>
              <StatusBadge status={o.status} />
            </Td>
            <Td>
              <div>{o.customerName ?? "—"}</div>
              <div className="text-xs text-slate-500">{o.customerPhone}</div>
            </Td>
            <Td className="max-w-sm">
              <div className="truncate">{o.pickupAddress}</div>
              <div className="truncate text-slate-500">→ {o.dropoffAddress}</div>
            </Td>
            <Td>{o.courierName ?? <span className="text-slate-400">—</span>}</Td>
            <Td className="whitespace-nowrap font-semibold">{formatTL(o.totalKurus)}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
