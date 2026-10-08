import { describe, expect, it } from "vitest";
import { ageLabel, fitView, project, toScreen, visibleTiles } from "../tiles.ts";

const beykoz = { lat: 41.1295, lng: 29.1135 };
const levent = { lat: 41.0819, lng: 29.0106 };

describe("harita karoları", () => {
  it("projeksiyon: z0'da dünya 256 px, (0,0) ortada", () => {
    expect(project({ lat: 0, lng: 0 }, 0)).toEqual({ x: 128, y: 128 });
    expect(project({ lat: 0, lng: 180 }, 1).x).toBe(512);
    // Beykoz z15 karosu (standart OSM formülü: x=19033, y=12269)
    const p = project(beykoz, 15);
    expect(Math.floor(p.x / 256)).toBe(19033);
    expect(Math.floor(p.y / 256)).toBe(12269);
  });

  it("tüm noktalar kenar boşluğu içinde kalır ve mümkün olan en yakın zoom seçilir", () => {
    const v = fitView([beykoz, levent], 360, 220, { padding: 30 });
    for (const p of [beykoz, levent]) {
      const s = toScreen(p, v);
      expect(s.left).toBeGreaterThanOrEqual(30);
      expect(s.left).toBeLessThanOrEqual(330);
      expect(s.top).toBeGreaterThanOrEqual(30);
      expect(s.top).toBeLessThanOrEqual(190);
    }
    const tighter = fitView([beykoz, levent], 360, 220, { padding: 30, maxZoom: v.zoom + 1, minZoom: v.zoom + 1 });
    const ps = [beykoz, levent].map((p) => toScreen(p, tighter));
    expect(Math.abs(ps[0]!.left - ps[1]!.left) > 300 || Math.abs(ps[0]!.top - ps[1]!.top) > 160).toBe(true);
  });

  it("tek nokta ortalanır", () => {
    const v = fitView([levent], 300, 200);
    expect(v.zoom).toBe(15);
    const s = toScreen(levent, v);
    expect(s.left).toBeCloseTo(150, 6);
    expect(s.top).toBeCloseTo(100, 6);
  });

  it("görünümü kaplayan karolar", () => {
    const v = fitView([levent], 300, 200);
    const tiles = visibleTiles(v, "https://t/{z}/{x}/{y}.png");
    expect(tiles.length).toBeGreaterThanOrEqual(2);
    expect(tiles.length).toBeLessThanOrEqual(6);
    for (const t of tiles) {
      expect(t.left).toBeLessThan(300);
      expect(t.left + 256).toBeGreaterThan(0);
      expect(t.url).toMatch(/^https:\/\/t\/15\/\d+\/\d+\.png$/);
    }
  });

  it("konum yaşı", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    expect(ageLabel("2026-10-08T11:59:30Z", now)).toBe("az önce");
    expect(ageLabel("2026-10-08T11:55:00Z", now)).toBe("5 dk önce");
    expect(ageLabel("2026-10-08T09:30:00Z", now)).toBe("2 sa önce");
  });
});
