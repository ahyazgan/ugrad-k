"use client";

import { ORDER_STATUSES, ORDER_STATUS_LABELS, formatTL, type OrderStatus } from "@yazgan/shared";
import Link from "next/link";
import { SlaBadge } from "@/components/SlaBadge";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, buttonClass, Card, Chip, EmptyState, ErrorText, Input, PageHeader, Stat, Table, Td } from "@/components/ui";
import { downloadCsv, kurusToCsv } from "@/lib/csv";
import { fmtDateTime, istDate } from "@/lib/dates";
import { isSlaRisk } from "@/lib/ops";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const ACTIVE: OrderStatus[] = ["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda", "sorunlu"];
const CRITICAL: OrderStatus[] = ["sorunlu"];
const WARN: OrderStatus[] = ["beklemede", "onaylandi"];

export default function SiparislerPage() {
  const [statuses, setStatuses] = useState<OrderStatus[]>(ACTIVE);
  const [slaOnly, setSlaOnly] = useState(false);
  const [from, setFrom] = useState(() => istDate(new Date(Date.now() - 7 * 86_400_000)));
  const [to, setTo] = useState(istDate());
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  // One query per date range/search; status chips filter locally so every chip can show its count
  const { data, error, loading, reload } = useLoad(() => repo.listOrders({ from, to, search: query || undefined }), [from, to, query]);
  // Live counters are independent of the date filter (an old order can still be open)
  const live = useLoad(() => repo.listOrders({ statuses: ACTIVE }));
  useEffect(() => repo.subscribeOrders(reload), [reload]);
  useEffect(() => repo.subscribeOrders(live.reload), [live.reload]);
  // Acil taahhüt geri sayımı yarım dakikada bir yenilenir
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    const m = new Map<OrderStatus, number>();
    for (const o of data ?? []) m.set(o.status, (m.get(o.status) ?? 0) + 1);
    return m;
  }, [data]);
  const rows = useMemo(
    () => (data ?? []).filter((o) => (!statuses.length || statuses.includes(o.status)) && (!slaOnly || isSlaRisk(o, now))),
    [data, statuses, slaOnly, now],
  );
  const liveOrders = live.data ?? [];
  const slaRisk = liveOrders.filter((o) => isSlaRisk(o, now)).length;
  const problem = liveOrders.filter((o) => o.status === "sorunlu").length;
  const waiting = liveOrders.filter((o) => o.status === "beklemede" || o.status === "onaylandi").length;

  const toggle = (s: OrderStatus) => setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  function exportCsv() {
    downloadCsv(`siparisler_${from}_${to}.csv`, [
      ["Sipariş No", "Tarih", "Durum", "Müşteri", "Telefon", "Alış", "Teslim", "Kurye", "KDV hariç", "Toplam", "Ödeme"],
      ...rows.map((o) => [
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
        subtitle={loading ? "Yükleniyor…" : `${rows.length} sipariş`}
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>
              CSV indir
            </Button>
            <Link href="/siparisler/yeni" className={buttonClass("primary")}>
              + Telefon siparişi
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Açık" value={live.data ? liveOrders.length : "…"} hint="Tüm tarihler" />
        <Stat label="Atama bekleyen" value={live.data ? waiting : "…"} tone={waiting ? "warn" : "default"} />
        <Stat
          label="SLA riski"
          value={live.data ? slaRisk : "…"}
          tone={slaRisk ? "critical" : "default"}
          hint="Acil, taahhüde ≤ 15 dk veya gecikmiş"
          pressed={slaOnly}
          onClick={() => {
            setSlaOnly((v) => !v);
            setStatuses(ACTIVE);
          }}
        />
        <Stat
          label="Sorunlu"
          value={live.data ? problem : "…"}
          tone={problem ? "critical" : "default"}
          hint="Yönetici müdahalesi bekliyor"
          pressed={!slaOnly && statuses.length === 1 && statuses[0] === "sorunlu"}
          onClick={() => {
            setSlaOnly(false);
            setStatuses(["sorunlu"]);
          }}
        />
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {ORDER_STATUSES.map((s) => (
            <Chip
              key={s}
              active={statuses.includes(s)}
              onClick={() => toggle(s)}
              count={counts.get(s) ?? 0}
              tone={CRITICAL.includes(s) ? "critical" : WARN.includes(s) ? "warn" : "default"}
            >
              {ORDER_STATUS_LABELS[s]}
            </Chip>
          ))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
          <button className="text-xs font-semibold text-brand underline underline-offset-2" onClick={() => setStatuses(ACTIVE)}>
            Aktifler
          </button>
          <button className="text-xs font-semibold text-brand underline underline-offset-2" onClick={() => setStatuses([])}>
            Tümü
          </button>
          {slaOnly ? (
            <button className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800" onClick={() => setSlaOnly(false)}>
              Yalnız SLA riski ×
            </button>
          ) : null}
        </div>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
          }}
        >
          <Input label="Başlangıç" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Bitiş" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Input label="Ara" placeholder="Sipariş no, adres, müşteri" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              Filtrele
            </Button>
          </div>
        </form>
      </Card>
      <ErrorText>{error}</ErrorText>
      <Card>
        <Table
          head={["No", "Tarih", "Durum", "Müşteri", "Nereden → Nereye", "Kurye", "Tutar"]}
          num={[6]}
          empty={
            loading ? (
              "Yükleniyor…"
            ) : (
              <EmptyState
                sticker="kutu"
                title="Filtreye uyan sipariş yok"
                description="Tarih aralığını genişletin veya tüm durumları gösterin."
                action={
                  <>
                    <Button variant="secondary" size="sm" onClick={() => setFrom(istDate(new Date(Date.now() - 30 * 86_400_000)))}>
                      Son 30 gün
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setStatuses([]);
                        setSlaOnly(false);
                      }}
                    >
                      Tüm durumlar
                    </Button>
                  </>
                }
              />
            )
          }
        >
          {rows.map((o) => (
            <tr key={o.id} className="hover:bg-canvas">
              <Td className="whitespace-nowrap">
                <Link className="font-semibold text-brand hover:underline" href={`/siparisler/${o.id}`}>
                  {o.orderNo}
                </Link>
                {o.urgent ? <div className="text-[11px] font-bold text-amber-700">ACİL</div> : null}
                <SlaBadge o={o} now={now} />
                {o.serviceLevel === "ekonomi" ? <div className="text-[11px] font-bold text-ink-soft">EKONOMİ</div> : null}
                {o.paymentMethod === "kart" && o.paymentStatus === "odenmedi" && o.status !== "iptal" ? (
                  <div className="text-xs font-semibold text-red-700">Ödeme bekleniyor</div>
                ) : null}
              </Td>
              <Td className="whitespace-nowrap">{fmtDateTime(o.createdAt)}</Td>
              <Td>
                <StatusBadge status={o.status} />
                {o.offerExpiresAt ? <div className="mt-1 text-xs font-semibold text-amber-700">Teklif bekliyor</div> : null}
              </Td>
              <Td>
                <div>{o.customerName ?? "—"}</div>
                <div className="text-xs text-muted">{o.customerPhone}</div>
              </Td>
              <Td className="max-w-[13rem] 2xl:max-w-sm">
                <div className="truncate">{o.pickupAddress}</div>
                <div className="truncate text-muted">→ {o.dropoffAddress}</div>
              </Td>
              <Td>{o.courierName ?? <span className="text-muted">—</span>}</Td>
              <Td num className="font-semibold">
                {formatTL(o.totalKurus)}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
