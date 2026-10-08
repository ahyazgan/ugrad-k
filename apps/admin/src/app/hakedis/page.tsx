"use client";

import { courierBalance, formatTL } from "@yazgan/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Card, ErrorText, Input, PageHeader, Stat, Table, Td } from "@/components/ui";
import { downloadCsv, kurusToCsv } from "@/lib/csv";
import { fmtDateTime } from "@/lib/dates";
import { repo, type CashCollection, type EarningRow } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const COLLECTION: Record<CashCollection, string> = { nakit: "Nakit (kuryede)", iban: "IBAN bildirildi", alinmadi: "Tahsil edilemedi" };

/** Net: artı → kuryeye ödenecek, eksi → kurye şirkete ödeyecek */
function Net({ kurus }: { kurus: number }) {
  return kurus >= 0 ? (
    <span className="font-semibold text-emerald-700">{formatTL(kurus)} kuryeye</span>
  ) : (
    <span className="font-semibold text-amber-700">{formatTL(-kurus)} kuryeden</span>
  );
}

export default function HakedisPage() {
  const { data, error, reload } = useLoad(async () => {
    const [unpaid, payouts, receivables] = await Promise.all([
      repo.listEarnings({ unpaidOnly: true }),
      repo.listPayouts(),
      repo.listReceivables(),
    ]);
    return { unpaid, payouts, receivables };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byCourier = useMemo(() => {
    const m = new Map<string, { courierId: string; name: string; rows: EarningRow[] }>();
    for (const e of data?.unpaid ?? []) {
      const g = m.get(e.courierId) ?? { courierId: e.courierId, name: e.courierName ?? "Kurye", rows: [] };
      g.rows.push(e);
      m.set(e.courierId, g);
    }
    return [...m.values()].map((g) => ({ ...g, balance: courierBalance(g.rows) })).sort((a, b) => b.balance.netKurus - a.balance.netKurus);
  }, [data]);
  const totals = courierBalance(data?.unpaid ?? []);
  const detail = byCourier.find((g) => g.courierId === selected) ?? null;

  async function act(fn: () => Promise<string>) {
    setBusy(true);
    setActionError(null);
    setMsg(null);
    try {
      setMsg(await fn());
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "İşlem başarısız");
    } finally {
      setBusy(false);
    }
  }

  const exportCsv = (rows: EarningRow[], name: string) =>
    downloadCsv(`hakedis_${name}.csv`, [
      ["Sipariş", "Kurye", "Teslim", "Km", "İş", "Km ücreti", "Prim", "Bekleme", "Köprü", "Hakediş", "Kuryedeki nakit"],
      ...rows.map((e) => [
        e.orderNo,
        e.courierName,
        fmtDateTime(e.deliveredAt),
        String(e.km).replace(".", ","),
        kurusToCsv(e.jobKurus),
        kurusToCsv(e.kmKurus),
        kurusToCsv(e.bonusKurus),
        kurusToCsv(e.waitingKurus),
        kurusToCsv(e.bridgeKurus),
        kurusToCsv(e.totalKurus),
        kurusToCsv(e.cashCollectedKurus),
      ]),
    ]);

  return (
    <>
      <PageHeader
        title="Kurye hakedişi"
        subtitle="Her teslimatın kurye kazancı ödeme modeline göre (Fiyatlar → Kurye ödeme ve maliyet modeli) otomatik hesaplanır. Kuryenin müşteriden aldığı nakit hakedişten düşülür."
        actions={
          <Button
            variant="secondary"
            disabled={busy}
            data-testid="run-earnings"
            onClick={() => act(async () => `${(await repo.runCourierEarnings()).written} yeni teslimatın hakedişi yazıldı.`)}
          >
            Hakedişleri güncelle
          </Button>
        }
      />
      <ErrorText>{error ?? actionError}</ErrorText>
      {msg ? <p className="mb-3 text-sm text-emerald-700" data-testid="hakedis-msg">{msg}</p> : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Ödenmemiş teslimat" value={totals.deliveries} />
        <Stat label="Toplam hakediş" value={formatTL(totals.earningsKurus)} />
        <Stat label="Kuryelerdeki nakit" value={formatTL(totals.cashKurus)} hint="Müşteriden tahsil edilip henüz teslim edilmemiş" />
        <Stat label="Net" value={<Net kurus={totals.netKurus} />} />
      </div>

      <Card title="Ödenmemiş hakedişler" className="mb-6">
        <Table head={["Kurye", "Teslimat", "Hakediş", "Kuryedeki nakit", "Net", ""]} empty="Ödenmemiş hakediş yok">
          {byCourier.map((g) => (
            <tr key={g.courierId} data-testid={`balance-${g.courierId}`}>
              <Td>
                <button className="font-semibold text-brand hover:underline" onClick={() => setSelected(g.courierId)}>
                  {g.name}
                </button>
              </Td>
              <Td>{g.balance.deliveries}</Td>
              <Td className="whitespace-nowrap">{formatTL(g.balance.earningsKurus)}</Td>
              <Td className="whitespace-nowrap">{formatTL(g.balance.cashKurus)}</Td>
              <Td className="whitespace-nowrap">
                <Net kurus={g.balance.netKurus} />
              </Td>
              <Td className="whitespace-nowrap text-right">
                {confirming === g.courierId ? (
                  <span className="inline-flex flex-wrap items-end justify-end gap-2">
                    <Input placeholder="Not (ör. havale, nakit)" value={note} onChange={(e) => setNote(e.target.value)} />
                    <Button
                      disabled={busy}
                      data-testid="confirm-payout"
                      onClick={() =>
                        act(async () => {
                          const p = await repo.createPayout(g.courierId, note);
                          setConfirming(null);
                          setNote("");
                          return `${p.courierName ?? "Kurye"} ile ${p.deliveryCount} teslimat hesaplaşıldı (${p.netKurus >= 0 ? "kuryeye ödenen" : "kuryeden alınan"} ${formatTL(Math.abs(p.netKurus))}).`;
                        })
                      }
                    >
                      Onayla
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(null)}>
                      Vazgeç
                    </Button>
                  </span>
                ) : (
                  <Button variant="secondary" data-testid={`payout-${g.courierId}`} onClick={() => setConfirming(g.courierId)}>
                    Hesaplaş
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-xs text-slate-500">
          Hesaplaş: o ana kadarki teslimatlar kapatılır. Net artıysa kuryeye ödeme yapın, eksiyse kuryeden elindeki nakdi alın.
        </p>
      </Card>

      {detail ? (
        <Card
          title={`${detail.name}: ödenmemiş teslimatlar`}
          className="mb-6"
          actions={
            <Button variant="secondary" onClick={() => exportCsv(detail.rows, detail.name.replace(/\s+/g, "_"))}>
              CSV indir
            </Button>
          }
        >
          <div className="max-h-96 overflow-y-auto">
            <Table head={["Sipariş", "Teslim", "Km", "İş + km", "Prim", "Bekleme", "Köprü", "Hakediş", "Nakit"]}>
              {detail.rows.map((e) => (
                <tr key={e.orderId}>
                  <Td>
                    <Link href={`/siparisler/${e.orderId}`} className="text-brand hover:underline">
                      {e.orderNo}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{fmtDateTime(e.deliveredAt)}</Td>
                  <Td>{e.km.toLocaleString("tr-TR")}</Td>
                  <Td className="whitespace-nowrap">{formatTL(e.jobKurus + e.kmKurus)}</Td>
                  <Td className="whitespace-nowrap">{e.bonusKurus ? formatTL(e.bonusKurus) : "—"}</Td>
                  <Td className="whitespace-nowrap">{e.waitingKurus ? formatTL(e.waitingKurus) : "—"}</Td>
                  <Td className="whitespace-nowrap">{e.bridgeKurus ? formatTL(e.bridgeKurus) : "—"}</Td>
                  <Td className="whitespace-nowrap font-semibold">{formatTL(e.totalKurus)}</Td>
                  <Td className="whitespace-nowrap">{e.cashCollectedKurus ? formatTL(e.cashCollectedKurus) : "—"}</Td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
      ) : null}

      <div className="space-y-6">
        <Card title="Tahsil edilecekler">
          <Table head={["Sipariş", "Müşteri", "Kurye", "Tutar", "Durum", ""]} empty="Bekleyen tahsilat yok">
            {(data?.receivables ?? []).map((r) => (
              <tr key={r.orderId} data-testid={`receivable-${r.orderNo}`}>
                <Td>
                  <Link href={`/siparisler/${r.orderId}`} className="text-brand hover:underline">
                    {r.orderNo}
                  </Link>
                </Td>
                <Td>
                  {r.customerName ?? "—"}
                  {r.customerPhone ? <div className="text-xs text-slate-500">{r.customerPhone}</div> : null}
                </Td>
                <Td>{r.courierName ?? "—"}</Td>
                <Td className="whitespace-nowrap">{formatTL(r.totalKurus)}</Td>
                <Td className={r.cashCollection === "alinmadi" ? "font-semibold text-red-700" : ""}>
                  {r.cashCollection ? COLLECTION[r.cashCollection] : "Bilinmiyor"}
                </Td>
                <Td className="text-right">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await repo.markOrderPaid(r.orderId);
                        return `${r.orderNo} ödendi olarak işaretlendi.`;
                      })
                    }
                  >
                    Ödeme alındı
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-slate-500">Kuryeye ödemeli olup nakit alınmayan teslimatlar: IBAN ödemesini hesabınızda görünce veya ödeme gelince işaretleyin.</p>
        </Card>

        <Card title="Hesaplaşma geçmişi">
          <Table head={["Tarih", "Kurye", "Teslimat", "Hakediş", "Nakit", "Net", ""]} empty="Henüz hesaplaşma yok">
            {(data?.payouts ?? []).map((p) => (
              <tr key={p.id} className={p.cancelledAt ? "text-slate-400 line-through" : ""}>
                <Td className="whitespace-nowrap">{fmtDateTime(p.createdAt)}</Td>
                <Td>
                  {p.courierName ?? "—"}
                  {p.note ? <div className="text-xs text-slate-500">{p.note}</div> : null}
                </Td>
                <Td>{p.deliveryCount}</Td>
                <Td className="whitespace-nowrap">{formatTL(p.earningsKurus)}</Td>
                <Td className="whitespace-nowrap">{formatTL(p.cashKurus)}</Td>
                <Td className="whitespace-nowrap">
                  <Net kurus={p.netKurus} />
                </Td>
                <Td className="whitespace-nowrap text-right">
                  {p.cancelledAt ? (
                    "İptal"
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => repo.listEarnings({ payoutId: p.id }).then((rows) => exportCsv(rows, `${p.createdAt.slice(0, 10)}_${p.courierName ?? "kurye"}`))}
                      >
                        CSV
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await repo.cancelPayout(p.id);
                            return "Hesaplaşma iptal edildi; teslimatlar yeniden ödenmemiş listesinde.";
                          })
                        }
                      >
                        İptal
                      </Button>
                    </>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
