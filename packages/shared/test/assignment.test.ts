import { describe, expect, it } from "vitest";
import { isDue, planAssignments, rankCouriers, roadKm, type AssignableOrder, type CandidateCourier } from "../assignment.ts";

const NOW = new Date("2026-10-09T09:00:00Z");
const fresh = new Date(NOW.getTime() - 60_000).toISOString();
const cfg = { maxActiveOrdersPerCourier: 3, maxPickupDistanceKm: 15, locationMaxAgeMinutes: 10, now: NOW };

// Beykoz alış noktası
const order = (over: Partial<AssignableOrder> = {}): AssignableOrder => ({
  id: "o1",
  pickupLat: 41.1295,
  pickupLng: 29.1135,
  urgent: false,
  createdAt: "2026-10-09T08:50:00Z",
  scheduledPickupAt: null,
  declinedBy: [],
  ...over,
});
const courier = (id: string, lat: number | null, lng: number | null, over: Partial<CandidateCourier> = {}): CandidateCourier => ({
  id,
  name: id,
  lat,
  lng,
  locationAt: fresh,
  activeOrders: 0,
  ...over,
});

const NEAR = courier("yakin", 41.12, 29.1); // Beykoz
const MID = courier("orta", 41.0262, 29.0156); // Üsküdar ~15 km yol
const FAR = courier("uzak", 40.9819, 28.8772); // Bakırköy

describe("rankCouriers", () => {
  it("en yakın uygun kurye önce", () => {
    const r = rankCouriers(order(), [MID, NEAR], cfg);
    expect(r[0]!.courier.id).toBe("yakin");
    expect(r[0]!.eligible).toBe(true);
    expect(r[0]!.distanceKm).toBeLessThan(3);
  });

  it("uygunsuzluk nedenleri", () => {
    const r = rankCouriers(
      order({ declinedBy: ["birakti"] }),
      [
        FAR,
        courier("konumsuz", null, null),
        courier("eski", 41.12, 29.1, { locationAt: new Date(NOW.getTime() - 11 * 60_000).toISOString() }),
        courier("dolu", 41.12, 29.1, { activeOrders: 3 }),
        courier("birakti", 41.12, 29.1),
      ],
      cfg,
    );
    const reason = Object.fromEntries(r.map((x) => [x.courier.id, x.reason]));
    expect(reason).toEqual({ uzak: "too_far", konumsuz: "no_location", eski: "stale_location", dolu: "at_capacity", birakti: "declined" });
    expect(r.every((x) => !x.eligible)).toBe(true);
  });

  it("moladaki kurye en yakın olsa da uygun değil", () => {
    const r = rankCouriers(order(), [courier("molada", 41.12, 29.1, { onBreak: true }), courier("bos", 41.1, 29.08)], cfg);
    expect(r[0]!.courier.id).toBe("bos");
    expect(r[0]!.eligible).toBe(true);
    expect(r.find((x) => x.courier.id === "molada")!.reason).toBe("on_break");
  });

  it("yük cezası: yakın ama yoğun kurye yerine biraz uzaktaki boş kurye", () => {
    const busyNear = courier("yogun", 41.125, 29.11, { activeOrders: 2 }); // ~0.5 km + 6
    const idleBit = courier("bos", 41.15, 29.09, { activeOrders: 0 }); // ~4 km
    expect(rankCouriers(order(), [busyNear, idleBit], cfg)[0]!.courier.id).toBe("bos");
  });

  it("yol km tahmini kuş uçuşundan büyüktür", () => {
    expect(roadKm({ lat: 41.0, lng: 29.0 }, { lat: 41.1, lng: 29.0 })).toBeCloseTo(15, 0);
  });
});

describe("planAssignments", () => {
  it("acil sipariş önce atanır, kapasite dolunca sıradaki beklemede kalır", () => {
    const one = { ...cfg, maxActiveOrdersPerCourier: 1 };
    const r = planAssignments(
      [order({ id: "normal", createdAt: "2026-10-09T08:00:00Z" }), order({ id: "acil", urgent: true, createdAt: "2026-10-09T08:55:00Z" })],
      [NEAR],
      one,
    );
    expect(r.assignments.map((a) => a.orderId)).toEqual(["acil"]);
    expect(r.unassigned).toEqual(["normal"]);
  });

  it("ekonomi sipariş, daha eski olsa da standarttan sonra atanır", () => {
    const one = { ...cfg, maxActiveOrdersPerCourier: 1 };
    const r = planAssignments(
      [order({ id: "eko", serviceLevel: "ekonomi", createdAt: "2026-10-09T07:00:00Z" }), order({ id: "std", createdAt: "2026-10-09T08:55:00Z" })],
      [NEAR],
      one,
    );
    expect(r.assignments.map((a) => a.orderId)).toEqual(["std"]);
    expect(r.unassigned).toEqual(["eko"]);
  });

  it("yük dağılımı: iki sipariş iki yakın kuryeye", () => {
    const near2 = courier("yakin2", 41.13, 29.12);
    const r = planAssignments([order({ id: "a" }), order({ id: "b", createdAt: "2026-10-09T08:51:00Z" })], [NEAR, near2], cfg);
    expect(new Set(r.assignments.map((a) => a.courierId))).toEqual(new Set(["yakin", "yakin2"]));
  });

  it("planlı sipariş alıştan 30 dk öncesine kadar atanmaz", () => {
    const later = order({ id: "planli", scheduledPickupAt: "2026-10-09T10:00:00Z" });
    expect(isDue(later, NOW)).toBe(false);
    expect(isDue(later, new Date("2026-10-09T09:31:00Z"))).toBe(true);
    const r = planAssignments([later], [NEAR], cfg);
    expect(r.assignments).toEqual([]);
    expect(r.unassigned).toEqual([]); // henüz zamanı gelmedi, uyarı da yok
  });

  it("uygun kurye yoksa atanmamış listesine", () => {
    expect(planAssignments([order()], [FAR], cfg)).toEqual({ assignments: [], unassigned: ["o1"] });
  });
});
