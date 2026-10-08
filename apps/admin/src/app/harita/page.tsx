"use client";

import { ORDER_STATUS_LABELS, ageLabel, type OrderStatus } from "@yazgan/shared";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { escapeHtml as esc, LeafletMap, type MapLine, type MapPin } from "@/components/LeafletMap";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, ErrorText, PageHeader } from "@/components/ui";
import { repo, type AdminOrder, type Courier } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const ACTIVE: OrderStatus[] = ["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda", "sorunlu"];
const UNASSIGNED: OrderStatus[] = ["beklemede", "onaylandi"];
const REFRESH_MS = 15_000;

const C = {
  pickup: "#0f3d6e",
  dropoff: "#047857",
  waiting: "#b91c1c",
  courier: "#f59e0b",
  stale: "#94a3b8",
};

const district = (a: string) => a.split(",").slice(-1)[0]!.trim().replace(/\/İstanbul$/i, "");
const minutesSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);

function Legend() {
  const dot = (color: string, label: string, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: color }}>
        {label}
      </span>
      {text}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {dot(C.waiting, "A", "Atama bekleyen alış")}
      {dot(C.pickup, "A", "Atanmış alış")}
      {dot(C.dropoff, "T", "Teslim")}
      {dot(C.courier, "🛵", "Kurye (güncel)")}
      {dot(C.stale, "🛵", "Kurye (konum eski)")}
    </div>
  );
}

function buildLayers(orders: AdminOrder[], couriers: Courier[], maxAgeMin: number) {
  const pins: MapPin[] = [];
  const lines: MapLine[] = [];
  const courierPos = new Map<string, [number, number]>();
  for (const c of couriers) {
    if (!c.isOnShift || c.lastLat == null || c.lastLng == null) continue;
    courierPos.set(c.id, [c.lastLat, c.lastLng]);
    const stale = !c.lastLocationAt || minutesSince(c.lastLocationAt) > maxAgeMin;
    pins.push({
      id: `kurye:${c.id}`,
      lat: c.lastLat,
      lng: c.lastLng,
      label: "🛵",
      size: 32,
      color: stale ? C.stale : C.courier,
      front: true,
      popup: `<b>${esc(c.fullName ?? "Kurye")}</b> · ${esc(c.plate ?? "")}<br>${c.activeOrderCount} aktif iş<br>Konum: ${
        c.lastLocationAt ? esc(ageLabel(c.lastLocationAt)) : "yok"
      }${c.phone ? `<br><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ""}`,
    });
  }
  for (const o of orders) {
    const waiting = UNASSIGNED.includes(o.status);
    const popup = `<b><a href="/siparisler/${esc(o.id)}">${esc(o.orderNo)}</a></b>${o.urgent ? " · <b style='color:#b45309'>ACİL</b>" : ""}<br>${esc(
      ORDER_STATUS_LABELS[o.status],
    )}${o.courierName ? ` · ${esc(o.courierName)}` : ""}<br>A: ${esc(o.pickupAddress)}<br>T: ${esc(o.dropoffAddress)}`;
    const pickedUp = o.status === "alindi" || o.status === "yolda";
    if (!pickedUp) {
      pins.push({ id: `alis:${o.id}`, lat: o.pickupLat, lng: o.pickupLng, label: "A", color: waiting || o.status === "sorunlu" ? C.waiting : C.pickup, popup });
    }
    pins.push({ id: `teslim:${o.id}`, lat: o.dropoffLat, lng: o.dropoffLng, label: "T", color: C.dropoff, popup });
    lines.push({
      id: `rota:${o.id}`,
      points: [
        [o.pickupLat, o.pickupLng],
        [o.dropoffLat, o.dropoffLng],
      ],
      color: waiting ? C.waiting : C.pickup,
      dashed: true,
      weight: 2,
    });
    const cp = o.courierId ? courierPos.get(o.courierId) : undefined;
    if (cp) {
      // Kuryeden sıradaki durağa
      lines.push({
        id: `kurye-rota:${o.id}`,
        points: [cp, pickedUp ? [o.dropoffLat, o.dropoffLng] : [o.pickupLat, o.pickupLng]],
        color: C.courier,
        weight: 3,
      });
    }
  }
  return { pins, lines };
}

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
    () => (data ? buildLayers(data.orders, data.couriers, data.ops.locationMaxAgeMinutes) : { pins: [], lines: [] }),
    [data],
  );
  const onShift = data?.couriers.filter((c) => c.isOnShift) ?? [];
  const waiting = data?.orders.filter((o) => UNASSIGNED.includes(o.status)) ?? [];
  const moving = data?.orders.filter((o) => !UNASSIGNED.includes(o.status)) ?? [];

  return (
    <>
      <PageHeader title="Canlı harita" subtitle="Vardiyadaki kuryeler ve açık siparişler. 15 saniyede bir ve her sipariş değişiminde yenilenir." />
      <ErrorText>{error}</ErrorText>
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-2">
          <Legend />
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
            {onShift.length === 0 ? <p className="text-sm text-slate-500">Vardiyada kurye yok.</p> : null}
            <ul className="divide-y divide-slate-100" data-testid="map-couriers">
              {onShift.map((c) => {
                const stale = !c.lastLocationAt || minutesSince(c.lastLocationAt) > (data?.ops.locationMaxAgeMinutes ?? 10);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <div className="font-semibold text-slate-900">{c.fullName}</div>
                      <div className={stale ? "text-xs text-red-700" : "text-xs text-slate-500"}>
                        {c.activeOrderCount} aktif iş · konum {c.lastLocationAt ? ageLabel(c.lastLocationAt) : "yok"}
                      </div>
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
            {waiting.length === 0 ? <p className="text-sm text-slate-500">Bekleyen sipariş yok.</p> : null}
            <ul className="divide-y divide-slate-100">
              {waiting.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <Link href={`/siparisler/${o.id}`} className="font-semibold text-brand hover:underline">
                      {o.orderNo}
                    </Link>
                    {o.urgent ? <span className="ml-1 text-xs font-bold text-amber-600">ACİL</span> : null}
                    <div className="truncate text-xs text-slate-500">
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
            {moving.length === 0 ? <p className="text-sm text-slate-500">Yolda iş yok.</p> : null}
            <ul className="divide-y divide-slate-100">
              {moving.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <Link href={`/siparisler/${o.id}`} className="font-semibold text-brand hover:underline">
                      {o.orderNo}
                    </Link>{" "}
                    <StatusBadge status={o.status} />
                    <div className="truncate text-xs text-slate-500">{o.courierName ?? "Kurye yok"}</div>
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
