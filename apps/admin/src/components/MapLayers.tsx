import { ORDER_STATUS_LABELS, ageLabel, type OrderStatus } from "@yazgan/shared";
import { escapeHtml as esc, type MapLine, type MapPin } from "@/components/LeafletMap";
import type { AdminOrder, Courier } from "@/lib/repo";

/** Map colours (Neo): ink for assigned pickups, violet for couriers; red/green stay semantic */
export const MAP_COLORS = {
  pickup: "#111114",
  dropoff: "#047857",
  waiting: "#b91c1c",
  courier: "#6d4aff",
  stale: "#94a3b8",
};

export const ACTIVE_STATUSES: OrderStatus[] = ["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda", "sorunlu"];
export const UNASSIGNED_STATUSES: OrderStatus[] = ["beklemede", "onaylandi"];

export const district = (a: string) => a.split(",").slice(-1)[0]!.trim().replace(/\/İstanbul$/i, "");
export const minutesSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);

export function MapLegend() {
  const C = MAP_COLORS;
  const dot = (color: string, label: string, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: color }}>
        {label}
      </span>
      {text}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {dot(C.waiting, "A", "Atama bekleyen alış")}
      {dot(C.pickup, "A", "Atanmış alış")}
      {dot(C.dropoff, "T", "Teslim")}
      {dot(C.courier, "K", "Kurye (güncel)")}
      {dot(C.stale, "K", "Kurye (konum eski)")}
    </div>
  );
}

/** Courier and open-order layers for the live map (shared by /harita and the dashboard mini map) */
export function buildMapLayers(orders: AdminOrder[], couriers: Courier[], maxAgeMin: number, opts: { routes?: boolean } = {}) {
  const C = MAP_COLORS;
  const routes = opts.routes ?? true;
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
      label: "K",
      size: 30,
      color: stale ? C.stale : C.courier,
      front: true,
      popup: `<b>${esc(c.fullName ?? "Kurye")}</b> · ${esc(c.plate ?? "")}${c.onBreak ? " · <b style='color:#b45309'>MOLADA</b>" : ""}<br>${c.activeOrderCount} aktif iş<br>Konum: ${
        c.lastLocationAt ? esc(ageLabel(c.lastLocationAt)) : "yok"
      }${c.phone ? `<br><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ""}`,
    });
  }
  for (const o of orders) {
    const waiting = UNASSIGNED_STATUSES.includes(o.status);
    const popup = `<b><a href="/siparisler/${esc(o.id)}">${esc(o.orderNo)}</a></b>${o.urgent ? " · <b style='color:#b45309'>ACİL</b>" : ""}<br>${esc(
      ORDER_STATUS_LABELS[o.status],
    )}${o.courierName ? ` · ${esc(o.courierName)}` : ""}<br>A: ${esc(o.pickupAddress)}<br>T: ${esc(o.dropoffAddress)}`;
    const pickedUp = o.status === "alindi" || o.status === "yolda";
    if (!pickedUp) {
      pins.push({ id: `alis:${o.id}`, lat: o.pickupLat, lng: o.pickupLng, label: "A", color: waiting || o.status === "sorunlu" ? C.waiting : C.pickup, popup });
    }
    pins.push({ id: `teslim:${o.id}`, lat: o.dropoffLat, lng: o.dropoffLng, label: "T", color: C.dropoff, popup });
    if (!routes) continue;
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
      // Courier → next stop
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
