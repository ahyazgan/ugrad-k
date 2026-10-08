"use client";

import {
  INELIGIBILITY_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  formatTL,
  rankCouriers,
  type OrderStatus,
} from "@yazgan/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, Card, ErrorText, Input, PageHeader, Select } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const PAYMENT_METHOD: Record<string, string> = { kart: "Kart", nakit: "Kuryeye (nakit/IBAN)", cari: "Cari hesap" };
const PAYMENT_STATUS: Record<string, string> = {
  odenmedi: "Ödenmedi",
  odendi: "Ödendi",
  iade_edildi: "İade edildi",
  iade_bekliyor: "İade bekliyor",
  cari_hesap: "Cari hesap",
};

// Yöneticinin elle yapabileceği geçişler (kurye atama ayrı işlem)
const MANUAL: OrderStatus[] = ["onaylandi", "alindi", "yolda", "teslim_edildi", "sorunlu", "iptal"];

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm text-slate-900">{children || "—"}</div>
    </div>
  );
}

export default function SiparisDetayPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useLoad(async () => {
    const [order, couriers, ops] = await Promise.all([repo.getOrder(id), repo.listCouriers(), repo.getOpsSettings()]);
    return { order, couriers: couriers.filter((c) => c.active), ops };
  }, [id]);
  useEffect(() => repo.subscribeOrders(reload), [reload]);

  const [courierId, setCourierId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [podUrl, setPodUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  const order = data?.order;

  useEffect(() => {
    if (order?.podPhotoPath) repo.podUrl(order.podPhotoPath).then(setPodUrl);
    if (order?.podSignaturePath) repo.podUrl(order.podSignaturePath).then(setSignatureUrl);
  }, [order?.podPhotoPath, order?.podSignaturePath]);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      setNote("");
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "İşlem başarısız");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!order) return <p className="text-slate-500">Yükleniyor…</p>;

  const allowed = ORDER_TRANSITIONS[order.status].filter((s) => MANUAL.includes(s));
  // Vardiyadaki kuryeler, otomatik atamayla aynı algoritmaya göre sıralı
  const ranked = rankCouriers(
    {
      id: order.id,
      pickupLat: order.pickupLat,
      pickupLng: order.pickupLng,
      urgent: order.urgent,
      createdAt: order.createdAt,
      scheduledPickupAt: order.scheduledPickupAt,
      declinedBy: [],
    },
    data!.couriers
      .filter((c) => c.isOnShift)
      .map((c) => ({ id: c.id, name: c.fullName, lat: c.lastLat, lng: c.lastLng, locationAt: c.lastLocationAt, activeOrders: c.activeOrderCount })),
    {
      maxActiveOrdersPerCourier: data!.ops.maxActiveOrdersPerCourier,
      maxPickupDistanceKm: data!.ops.maxPickupDistanceKm,
      locationMaxAgeMinutes: data!.ops.locationMaxAgeMinutes,
      now: new Date(),
    },
  );
  const awaitingPayment = order.paymentMethod === "kart" && order.paymentStatus !== "odendi";
  const canAssign = ["beklemede", "onaylandi", "kuryeye_atandi", "sorunlu"].includes(order.status) && !awaitingPayment;
  const trackingUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/takip/${order.trackingToken}`;

  return (
    <>
      <PageHeader
        title={`${order.orderNo}${order.urgent ? " · ACİL" : order.serviceLevel === "ekonomi" ? " · EKONOMİ" : ""}`}
        subtitle={`Oluşturma: ${fmtDateTime(order.createdAt)}`}
        actions={
          <Link href="/siparisler" className="text-sm text-brand underline">
            ← Siparişler
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Durum" actions={<StatusBadge status={order.status} />}>
            <div className="space-y-4">
              {awaitingPayment && order.status !== "iptal" ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Kartla ödeme bekleniyor — ödeme tamamlanınca kurye atanabilir.
                </p>
              ) : null}
              {canAssign ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-60 flex-1">
                    <Select label="Kurye ata" value={courierId} onChange={(e) => setCourierId(e.target.value)}>
                      <option value="">Kurye seçin… (öneri sırasıyla)</option>
                      {ranked.map((r) => (
                        <option key={r.courier.id} value={r.courier.id}>
                          {r.eligible ? "★ " : ""}
                          {r.courier.name} — {r.distanceKm != null ? `${r.distanceKm.toLocaleString("tr-TR")} km, ` : ""}
                          {r.courier.activeOrders} aktif iş
                          {r.reason ? ` (${INELIGIBILITY_LABELS[r.reason]})` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button disabled={!courierId || busy} onClick={() => act(() => repo.assignCourier(order.id, courierId))}>
                    {order.courierId ? "Yeniden ata" : "Ata"}
                  </Button>
                </div>
              ) : null}
              {allowed.length ? (
                <div className="space-y-2">
                  <Input label="Not (iptal / sorun için zorunlu)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className="flex flex-wrap gap-2">
                    {allowed.map((s) => (
                      <Button
                        key={s}
                        variant={s === "iptal" || s === "sorunlu" ? "danger" : "secondary"}
                        disabled={busy || ((s === "iptal" || s === "sorunlu") && note.trim().length < 3)}
                        onClick={() => act(() => repo.setStatus(order.id, s, note.trim() || undefined))}
                      >
                        → {ORDER_STATUS_LABELS[s]}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Bu sipariş son durumda.</p>
              )}
              <ErrorText>{actionError}</ErrorText>
            </div>
          </Card>

          <Card title="Gönderi">
            <div className="grid gap-4 sm:grid-cols-2">
              <Info label={`Alış (${order.pickupSide ?? "?"})`}>
                {order.pickupAddress}
                {order.pickupDetails ? <div className="text-slate-500">{order.pickupDetails}</div> : null}
              </Info>
              <Info label={`Teslim (${order.dropoffSide ?? "?"})`}>
                {order.dropoffAddress}
                {order.dropoffDetails ? <div className="text-slate-500">{order.dropoffDetails}</div> : null}
              </Info>
              <Info label="Teslim eden">
                {order.pickupContactName} {order.pickupContactPhone}
              </Info>
              <Info label="Alıcı">
                {order.dropoffContactName} {order.dropoffContactPhone}
              </Info>
              <Info label="Paket">
                {order.packageDescription}
                {order.weightKg ? ` · ${order.weightKg} kg` : ""}
              </Info>
              <Info label="Müşteri notu">{order.customerNote}</Info>
              <Info label="Mesafe">{(order.distanceMeters / 1000).toFixed(1)} km{order.roundTrip ? " · gidiş-dönüş" : ""}</Info>
              <Info label="Planlı alış">{order.scheduledPickupAt ? fmtDateTime(order.scheduledPickupAt) : "Hemen"}</Info>
              {order.cancelReason ? <Info label="İptal nedeni">{order.cancelReason}</Info> : null}
              {order.problemNote ? <Info label="Sorun">{order.problemNote}</Info> : null}
            </div>
          </Card>

          {order.status === "teslim_edildi" ? (
            <Card title="Teslim kanıtı">
              <div className="grid gap-4 sm:grid-cols-2">
                <Info label="Teslim alan">{order.podReceiverName}</Info>
                <Info label="Teslim zamanı">{fmtDateTime(order.deliveredAt)}</Info>
                <Info label="Bekleme">{order.waitingMinutes} dk</Info>
                <Info label="İmza">
                  {signatureUrl ? (
                    <a className="text-brand underline" href={signatureUrl} target="_blank" rel="noreferrer">
                      Görüntüle
                    </a>
                  ) : order.podSignaturePath ? (
                    "Yüklendi"
                  ) : (
                    "Yok"
                  )}
                </Info>
                <Info label="Fotoğraf">
                  {podUrl ? (
                    <a className="text-brand underline" href={podUrl} target="_blank" rel="noreferrer">
                      Görüntüle
                    </a>
                  ) : order.podPhotoPath ? (
                    "Yüklendi"
                  ) : (
                    "Yok"
                  )}
                </Info>
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="Müşteri">
            <div className="space-y-3">
              <Info label="Ad">{order.customerName}</Info>
              <Info label="Telefon">{order.customerPhone}</Info>
              <Info label="Ödeme">
                {PAYMENT_METHOD[order.paymentMethod]} · {PAYMENT_STATUS[order.paymentStatus] ?? order.paymentStatus}
                {order.paidKurus != null ? <div className="text-slate-500">Ödenen: {formatTL(order.paidKurus)}</div> : null}
                {order.paidKurus != null && order.totalKurus > order.paidKurus ? (
                  <div className="font-semibold text-amber-700">Ek tahsilat: {formatTL(order.totalKurus - order.paidKurus)}</div>
                ) : null}
                {order.paymentError ? <div className="text-red-700">{order.paymentError}</div> : null}
                {order.paymentStatus === "iade_bekliyor" ? (
                  <div className="text-red-700">iyzico panelinden iade yapılmalı (ödeme no: {order.paymentRef})</div>
                ) : null}
              </Info>
              <Info label="Takip linki">
                <button className="break-all text-left text-brand underline" onClick={() => navigator.clipboard?.writeText(trackingUrl)}>
                  Kopyala
                </button>
              </Info>
            </div>
          </Card>
          <Card title="Fiyat">
            <dl className="space-y-1.5 text-sm">
              {order.priceQuote.lines.map((l) => (
                <div key={l.code} className="flex justify-between gap-3">
                  <dt className="text-slate-600">{l.label}</dt>
                  <dd>{formatTL(l.amountKurus)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1.5">
                <dt>KDV</dt>
                <dd>{formatTL(order.priceQuote.vatKurus)}</dd>
              </div>
              <div className="flex justify-between font-bold">
                <dt>Toplam</dt>
                <dd>{formatTL(order.totalKurus)}</dd>
              </div>
            </dl>
          </Card>
          <Card title="Geçmiş">
            <ol className="space-y-2 text-sm">
              {order.history.map((h, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    {ORDER_STATUS_LABELS[h.toStatus]}
                    {h.note ? <span className="block text-xs text-slate-500">{h.note}</span> : null}
                  </span>
                  <span className="whitespace-nowrap text-slate-500">{fmtDateTime(h.at)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
