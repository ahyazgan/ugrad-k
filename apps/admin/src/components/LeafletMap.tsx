"use client";

import "leaflet/dist/leaflet.css";
import { DEFAULT_TILE_ATTRIBUTION, DEFAULT_TILE_URL } from "@yazgan/shared";
import type { LayerGroup, Map as LMap } from "leaflet";
import { useEffect, useRef } from "react";

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || DEFAULT_TILE_URL;
const ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || DEFAULT_TILE_ATTRIBUTION;
const ISTANBUL: [number, number] = [41.04, 29.03];

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  /** İşaretin içindeki kısa metin / emoji */
  label: string;
  /** Tailwind dışı: doğrudan CSS rengi */
  color: string;
  size?: number;
  /** Açılır kutu (HTML) */
  popup?: string;
  /** Üstte çizilsin mi (z-index) */
  front?: boolean;
}

export interface MapLine {
  id: string;
  points: Array<[number, number]>;
  color: string;
  dashed?: boolean;
  weight?: number;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Leaflet haritası (OSM karoları; NEXT_PUBLIC_MAP_TILE_URL ile değiştirilebilir).
 * `fitKey` değiştiğinde görünüm tüm işaretlere sığdırılır; veri yenilemeleri kullanıcının
 * kaydırdığı görünümü bozmaz. `focus` verilirse o noktaya uçar.
 */
export function LeafletMap({
  pins,
  lines = [],
  fitKey,
  focus,
  className,
  onPinClick,
  interactive = true,
}: {
  pins: MapPin[];
  lines?: MapLine[];
  fitKey: string;
  focus?: { lat: number; lng: number; seq: number } | null;
  className?: string;
  onPinClick?: (id: string) => void;
  /** false: static preview without pan/zoom or controls (dashboard mini map) */
  interactive?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const fitted = useRef<string | null>(null);
  const latest = useRef({ pins, lines, fitKey, onPinClick });
  const live = useRef(interactive);

  function draw() {
    const lib = L.current;
    const m = map.current;
    const group = layer.current;
    if (!lib || !m || !group) return;
    const { pins: ps, lines: ls, fitKey: key, onPinClick: click } = latest.current;
    group.clearLayers();
    for (const l of ls) {
      lib.polyline(l.points, { color: l.color, weight: l.weight ?? 3, opacity: 0.75, dashArray: l.dashed ? "6 8" : undefined }).addTo(group);
    }
    for (const p of ps) {
      const size = p.size ?? 26;
      const icon = lib.divIcon({
        className: "",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
        html: `<div data-pin="${esc(p.id)}" style="width:${size}px;height:${size}px;border-radius:50%;background:${p.color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font:700 ${size > 28 ? 15 : 12}px system-ui">${esc(p.label)}</div>`,
      });
      const marker = lib.marker([p.lat, p.lng], { icon, zIndexOffset: p.front ? 1000 : 0, title: p.id }).addTo(group);
      if (p.popup) marker.bindPopup(p.popup);
      if (click) marker.on("click", () => click(p.id));
    }
    if (fitted.current !== key) {
      fitted.current = key;
      const pts = [...ps.map((p) => [p.lat, p.lng] as [number, number]), ...ls.flatMap((l) => l.points)];
      if (pts.length > 1) m.fitBounds(lib.latLngBounds(pts), { padding: live.current ? [40, 40] : [24, 24], maxZoom: 15 });
      else if (pts.length === 1) m.setView(pts[0]!, 15);
    }
  }

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((lib) => {
      if (cancelled || !el.current || map.current) return;
      L.current = lib;
      const on = live.current;
      map.current = lib
        .map(el.current, {
          zoomControl: on,
          attributionControl: true,
          dragging: on,
          scrollWheelZoom: on,
          doubleClickZoom: on,
          boxZoom: on,
          keyboard: on,
          touchZoom: on,
        })
        .setView(ISTANBUL, 11);
      lib.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map.current);
      layer.current = lib.layerGroup().addTo(map.current);
      draw();
    });
    // Container may change size after first paint (flexible card layouts): keep tiles in sync
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.current?.invalidateSize()) : null;
    if (el.current) ro?.observe(el.current);
    return () => {
      cancelled = true;
      ro?.disconnect();
      map.current?.remove();
      map.current = null;
      layer.current = null;
      fitted.current = null;
    };
    // draw latest.current'tan okur; harita yalnızca bir kez kurulur
  }, []);

  useEffect(() => {
    latest.current = { pins, lines, fitKey, onPinClick };
    draw();
  }, [pins, lines, fitKey, onPinClick]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lng], Math.max(map.current.getZoom(), 14), { duration: 0.6 });
  }, [focus]);

  return <div ref={el} className={className} data-testid="leaflet-map" />;
}

export { esc as escapeHtml };
