import { describe, expect, it } from "vitest";
import { rankCouriers } from "../assignment.ts";
import { courierPerformance, performanceBonusKm, type PerformanceStats } from "../performance.ts";

const base: PerformanceStats = {
  offersAccepted: 18,
  offersDeclined: 1,
  offersTimedOut: 1,
  delivered: 40,
  urgentDelivered: 10,
  urgentOnTime: 9,
  ratingCount: 12,
  ratingAvg: 4.75,
  released: 0,
  failedDeliveries: 1,
  shiftsBooked: 10,
  shiftsAttended: 10,
  lateCancels: 0,
};

describe("kurye performansı", () => {
  it("ağırlıklı puan ve kademe", () => {
    const p = courierPerformance(base);
    // kabul .9×25 + taahhüt .9×20 + puan .9375×20 + tamamlama 1×15 + vardiya 1×20 = 94.25
    expect(p.score).toBe(94);
    expect(p.tier).toBe("altin");
    expect(p.parts.find((x) => x.key === "acceptance")!.detail).toBe("18/20 (%90) · 1 yanıtsız");
  });

  it("az veride bileşen hesaba girmez; çok az veride puan yok", () => {
    const fewUrgent = courierPerformance({ ...base, urgentDelivered: 2, urgentOnTime: 0 });
    expect(fewUrgent.parts.find((x) => x.key === "onTime")!.value).toBeNull();
    expect(fewUrgent.score).toBe(Math.round(((0.9 * 25 + 0.9375 * 20 + 15 + 20) / 80) * 100));
    const fresh = courierPerformance({ ...base, offersAccepted: 2, offersDeclined: 0, offersTimedOut: 0, urgentDelivered: 0, urgentOnTime: 0, ratingCount: 1, delivered: 2, shiftsBooked: 1, shiftsAttended: 1 });
    expect(fresh).toMatchObject({ score: null, tier: "yeni" });
  });

  it("geç iptal ve gelmeme vardiya uyumunu düşürür; işi bırakma tamamlamayı", () => {
    const p = courierPerformance({ ...base, shiftsBooked: 8, shiftsAttended: 5, lateCancels: 2, released: 10 });
    expect(p.parts.find((x) => x.key === "attendance")!.value).toBe(0.5);
    expect(p.parts.find((x) => x.key === "completion")!.value).toBe(0.8);
    expect(p.tier).toBe("gumus");
  });

  it("atamada km avantajı: 70 nötr, ±3 km sınır", () => {
    expect(performanceBonusKm(70)).toBe(0);
    expect(performanceBonusKm(90)).toBe(2);
    expect(performanceBonusKm(20)).toBe(-3);
    expect(performanceBonusKm(null)).toBe(0);
    const order = { id: "o", pickupLat: 41.1295, pickupLng: 29.1135, urgent: false, createdAt: "2026-10-09T08:50:00Z", scheduledPickupAt: null, declinedBy: [] };
    const fresh = new Date("2026-10-09T08:59:00Z").toISOString();
    const r = rankCouriers(
      order,
      [
        { id: "yakin-dusuk", name: null, lat: 41.12, lng: 29.1, locationAt: fresh, activeOrders: 0, performance: 40 },
        { id: "biraz-uzak-yuksek", name: null, lat: 41.14, lng: 29.13, locationAt: fresh, activeOrders: 0, performance: 95 },
      ],
      { maxActiveOrdersPerCourier: 3, maxPickupDistanceKm: 15, locationMaxAgeMinutes: 10, now: new Date("2026-10-09T09:00:00Z") },
    );
    expect(r[0]!.courier.id).toBe("biraz-uzak-yuksek");
  });
});
