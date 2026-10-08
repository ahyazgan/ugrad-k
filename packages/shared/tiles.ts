// Harita karoları (Web Mercator / "slippy map") hesapları. Mobil uygulama bu hesapla
// yerel modül veya API anahtarı gerektirmeden harita çizer; panel Leaflet kullanır.

import type { LatLng } from "./geo.ts";

export const TILE_SIZE = 256;

/** Varsayılan karo sunucusu (OpenStreetMap). Yoğun kullanımda ticari sağlayıcıya geçin (docs/kurulum.md). */
export const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const DEFAULT_TILE_ATTRIBUTION = "© OpenStreetMap katkıcıları";

/** Enlem/boylam → verilen yakınlaştırmada dünya pikseli */
export function project({ lat, lng }: LatLng, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}

export interface MapView {
  zoom: number;
  /** Görünümün sol üst köşesinin dünya pikseli */
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * Noktaların hepsini `padding` kenar boşluğuyla sığdıran en yakın tam sayı yakınlaştırma.
 * Tek nokta için `singleZoom` kullanılır.
 */
export function fitView(
  points: LatLng[],
  width: number,
  height: number,
  { padding = 32, minZoom = 9, maxZoom = 16, singleZoom = 15 }: { padding?: number; minZoom?: number; maxZoom?: number; singleZoom?: number } = {},
): MapView {
  const pts = points.length ? points : [{ lat: 41.0369, lng: 29.0 }]; // İstanbul
  let zoom = pts.length === 1 ? singleZoom : maxZoom;
  if (pts.length > 1) {
    for (; zoom > minZoom; zoom--) {
      const ps = pts.map((p) => project(p, zoom));
      const w = Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x));
      const h = Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y));
      if (w <= width - 2 * padding && h <= height - 2 * padding) break;
    }
  }
  const ps = pts.map((p) => project(p, zoom));
  const cx = (Math.max(...ps.map((p) => p.x)) + Math.min(...ps.map((p) => p.x))) / 2;
  const cy = (Math.max(...ps.map((p) => p.y)) + Math.min(...ps.map((p) => p.y))) / 2;
  return { zoom, originX: cx - width / 2, originY: cy - height / 2, width, height };
}

/** Görünümdeki nokta konumu (piksel, sol üstten) */
export function toScreen(p: LatLng, v: MapView): { left: number; top: number } {
  const w = project(p, v.zoom);
  return { left: w.x - v.originX, top: w.y - v.originY };
}

/** Görünümü kaplayan karolar ve ekrandaki konumları */
export function visibleTiles(v: MapView, urlTemplate = DEFAULT_TILE_URL): Array<{ key: string; url: string; left: number; top: number }> {
  const n = 2 ** v.zoom;
  const x0 = Math.floor(v.originX / TILE_SIZE);
  const y0 = Math.floor(v.originY / TILE_SIZE);
  const x1 = Math.floor((v.originX + v.width - 1) / TILE_SIZE);
  const y1 = Math.floor((v.originY + v.height - 1) / TILE_SIZE);
  const out: Array<{ key: string; url: string; left: number; top: number }> = [];
  for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y++) {
    for (let x = x0; x <= x1; x++) {
      const wx = ((x % n) + n) % n; // tarih çizgisinde sarma
      out.push({
        key: `${v.zoom}/${x}/${y}`,
        url: urlTemplate.replace("{z}", String(v.zoom)).replace("{x}", String(wx)).replace("{y}", String(y)),
        left: x * TILE_SIZE - v.originX,
        top: y * TILE_SIZE - v.originY,
      });
    }
  }
  return out;
}

/** Konum ne kadar eski? "az önce", "3 dk önce", "2 sa önce" */
export function ageLabel(iso: string, now = new Date()): string {
  const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  return `${Math.floor(min / 60)} sa önce`;
}
