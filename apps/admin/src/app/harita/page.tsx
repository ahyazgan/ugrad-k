"use client";

import { STOP_LABELS, ageLabel, planStops } from "@yazgan/shared";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LeafletMap } from "@/components/LeafletMap";
import { ACTIVE_STATUSES as ACTIVE, buildMapLayers, district, MapLegend, minutesSince, UNASSIGNED_STATUSES as UNASSIGNED } from "@/components/MapLayers";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, ErrorText, PageHeader } from "@/components/ui";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const REFRESH_MS = 15_000;

export default function HaritaPage() {
  const { data, error, reload } = useLoad(async () => {
    const [orders, couriers, ops] = await Promise.all([repo.listOrders({ statuses: ACTIVE }), repo.listCouriers(), repo.getOpsSettings()]);
    return { orders, couriers, ops };
  });
  const [focus, setFocus] = useState<{ lat: number; lng: number; seq: number } | null>(null);
  const flyTo = (lat: number, lng: number) => setFocus((f) => ({ lat, lng, seq: (f?.seq ?? 0) + 1 }));

  useEffect(() => {
    const unsub = repo.subscribeOrders(reload);
    const timer = setInterval(reload, REFRESH_MS);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [reload]);

  const layers = useMemo(
    () => (data ? buildMapLayers(data.orders, data.couriers, data.ops.locationMaxAgeMinutes) : { pins: [], lines: [] }),
    [data],
  );
  const onShift = data?.couriers.filter((c) => c.isOnShift) ?? [];
  // Her kuryenin sıradaki durağı (kurye uygulamasındaki durak sırasıyla aynı hesap)
  const nextStop = useMemo(() => {
    const m = new Map<string, { label: string; eta: number; late: boolean }>();
    for (const c of data?.couriers ?? []) {
      const jobs = (data?.orders ?? []).filter((o) => o.courierId === c.id && !o.offerExpiresAt);
      const stops = planStops(
        jobs.map((o) => ({
          id: o.id,
          orderNo: o.orderNo,
          status: o.status,
          pickup: { lat: o.pickupLat, lng: o.pickupLng, address: o.pickupAddress },
          dropoff: { lat: o.dropoffLat, lng: o.dropoffLng, address: o.dropoffAddress },
          urgent: o.urgent,
          slaDueAt: o.slaDueAt,
        })),
        c.lastLat != null && c.lastLng != null ? { lat: c.lastLat, lng: c.lastLng } : null,
      );
      if (stops[0]) m.set(c.id, { label: `${STOP_LABELS[stops[0].kind]} · ${stops[0].orderNo}`, eta: stops[0].etaMinutes, late: stops.some((s) => s.late) });
    }
    return m;
  }, [data]);
  const waiting = data?.orders.filter((o) => UNASSIGNED.includes(o.status)) ?? [];
  const moving = data?.orders.filter((o) => !UNASSIGNED.includes(o.status)) ?? [];

  return (
    <>
      <PageHeader title="Canlı harita" subtitle="Vardiyadaki kuryeler ve açık siparişler. 15 saniyede bir ve her sipariş değişiminde yenilenir." />
      <ErrorText>{error}</ErrorText>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-2">
          <MapLegend />
          <div className="overflow-hidden rounded-card border border-line bg-white">
            <LeafletMap
              className="h-[60vh] min-h-[420px] w-full"
              pins={layers.pins}
              lines={layers.lines}
              fitKey={data ? "ilk" : "bos"}
              focus={focus}
            />
          </div>
        </div>
        <div className="space-y-4">
          <Card title={`Vardiyadaki kuryeler (${onShift.length})`}>
            {onShift.length === 0 ? <p className="text-sm text-muted">Vardiyada kurye yok.</p> : null}
            <ul className="divide-y divide-line" data-testid="map-couriers">
              {onShift.map((c) => {
                const stale = !c.lastLocationAt || minutesSince(c.lastLocationAt) > (data?.ops.locationMaxAgeMinutes ?? 10);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {c.fullName}
                        {c.onBreak ? <span className="ml-2 text-xs font-semibold text-amber-700">Molada</span> : null}
                      </div>
                      <div className={stale ? "text-xs text-red-700" : "text-xs text-muted"}>
                        {c.activeOrderCount} aktif iş · konum {c.lastLocationAt ? ageLabel(c.lastLocationAt) : "yok"}
                      </div>
                      {nextStop.get(c.id) ? (
                        <div className={`text-xs ${nextStop.get(c.id)!.late ? "font-semibold text-red-700" : "text-slate-600"}`} data-testid={`next-stop-${c.id}`}>
                          Sıradaki: {nextStop.get(c.id)!.label} (~{nextStop.get(c.id)!.eta} dk)
                          {nextStop.get(c.id)!.late ? " · taahhüt riski" : ""}
                        </div>
                      ) : null}
                    </div>
                    {c.lastLat != null && c.lastLng != null ? (
                      <button className="text-xs font-semibold text-brand hover:underline" onClick={() => flyTo(c.lastLat!, c.lastLng!)}>
                        Göster
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title={`Atama bekleyen (${waiting.length})`}>
            {waiting.length === 0 ? <p className="text-sm text-muted">Bekleyen sipariş yok.</p> : null}
            <ul className="divide-y divide-line">
              {waiting.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <Link href={`/siparisler/${o.id}`} className="font-semibold text-brand hover:underline">
                      {o.orderNo}
                    </Link>
                    {o.urgent ? <span className="ml-1 text-xs font-bold text-amber-600">ACİL</span> : null}
                    <div className="truncate text-xs text-muted">
                      {district(o.pickupAddress)} → {district(o.dropoffAddress)} · {minutesSince(o.createdAt)} dk
                    </div>
                  </div>
                  <button className="text-xs font-semibold text-brand hover:underline" onClick={() => flyTo(o.pickupLat, o.pickupLng)}>
                    Göster
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={`Devam eden (${moving.length})`}>
            {moving.length === 0 ? <p className="text-sm text-muted">Yolda iş yok.</p> : null}
            <ul className="divide-y divide-line">
              {moving.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <Link href={`/siparisler/${o.id}`} className="font-semibold text-brand hover:underline">
                      {o.orderNo}
                    </Link>{" "}
                    <StatusBadge status={o.status} />
                    <div className="truncate text-xs text-muted">{o.courierName ?? "Kurye yok"}</div>
                  </div>
                  <button className="text-xs font-semibold text-brand hover:underline" onClick={() => flyTo(o.dropoffLat, o.dropoffLng)}>
                    Göster
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
