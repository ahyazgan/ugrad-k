import { calculatePrice, DEFAULT_PRICING_SETTINGS, roadKm } from "@yazgan/shared";
import { describe, expect, it } from "vitest";
import { DISTRICTS, districtBySlug } from "../src/lib/districts";
import { districtEstimate } from "../src/lib/pricing-info";

const S = DEFAULT_PRICING_SETTINGS;

describe("ilçe sayfası tahmini fiyat", () => {
  it("her ilçenin İstanbul içinde bir merkezi var", () => {
    for (const d of DISTRICTS) {
      expect(d.center.lat, d.slug).toBeGreaterThan(40.7);
      expect(d.center.lat, d.slug).toBeLessThan(41.3);
      expect(d.center.lng, d.slug).toBeGreaterThan(28.8);
      expect(d.center.lng, d.slug).toBeLessThan(29.5);
    }
  });

  it("mesafe atamadaki yol tahmini, fiyat ortak fiyat fonksiyonu", () => {
    const d = districtBySlug("kadikoy")!;
    const e = districtEstimate(S, d);
    expect(e.km).toBe(Math.ceil(roadKm({ lat: S.serviceCenterLat, lng: S.serviceCenterLng }, d.center)));
    expect(e.bridgeCrossings).toBe(0);
    const direct = calculatePrice(
      { distanceMeters: e.km * 1000, serviceLevel: "standart", pickupAt: new Date("2026-10-13T07:00:00Z") },
      S,
    );
    expect(e.quote.subtotalKurus).toBe(direct.subtotalKurus);
    expect(e.quote.subtotalKurus).toBeGreaterThan(S.baseFeeKurus);
  });

  it("Avrupa yakası ilçelerine bir köprü geçişi eklenir", () => {
    const e = districtEstimate(S, districtBySlug("besiktas")!);
    expect(e.bridgeCrossings).toBe(1);
    expect(e.quote.lines.some((l) => l.code === "bridge")).toBe(true);
  });

  it("merkez ilçe (Beykoz) yalnız açılış ücreti kadar", () => {
    expect(districtEstimate(S, districtBySlug("beykoz")!).quote.subtotalKurus).toBe(S.baseFeeKurus);
  });
});
