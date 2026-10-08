import { describe, expect, it } from "vitest";
import type { AdminOrder } from "../src/lib/repo/types";
import { buildReport, deliveryMinutes, ordersCsv } from "../src/lib/reports";

const base: AdminOrder = {
  id: "o",
  orderNo: "YK-1",
  status: "teslim_edildi",
  createdAt: "2026-10-05T07:00:00Z", // 10:00 İstanbul
  urgent: false,
  serviceLevel: "standart",
  roundTrip: false,
  pickupAddress: "A",
  pickupSide: "anadolu",
  pickupLat: 41,
  pickupLng: 29,
  dropoffAddress: "B",
  dropoffSide: "anadolu",
  dropoffLat: 41,
  dropoffLng: 29,
  customerId: "c1",
  customerName: "Ayşe",
  customerPhone: "+905",
  corporateAccountId: null,
  courierId: "k1",
  courierName: "Mehmet",
  totalKurus: 48_000,
  subtotalKurus: 40_000,
  paymentMethod: "nakit",
  paymentStatus: "odenmedi",
  paidKurus: null,
  cashCollection: null,
  slaDueAt: null,
  slaMissed: null,
  offerExpiresAt: null,
  distanceMeters: 5000,
  scheduledPickupAt: null,
  deliveredAt: "2026-10-05T07:45:00Z",
};
const o = (over: Partial<AdminOrder>): AdminOrder => ({ ...base, ...over });

describe("raporlar", () => {
  it("teslim süresi planlı alıştan başlar", () => {
    expect(deliveryMinutes(base)).toBe(45);
    expect(deliveryMinutes(o({ scheduledPickupAt: "2026-10-05T07:30:00Z" }))).toBe(15);
    expect(deliveryMinutes(o({ deliveredAt: null }))).toBeNull();
  });

  it("toplamlar, acil zamanında oranı, iptal ve yaka oranı", () => {
    const r = buildReport(
      [
        o({ id: "1" }),
        o({ id: "2", urgent: true, deliveredAt: "2026-10-05T07:50:00Z", dropoffSide: "avrupa" }), // 50 dk → zamanında
        o({ id: "3", urgent: true, deliveredAt: "2026-10-05T08:30:00Z" }), // 90 dk → geç
        o({ id: "4", status: "iptal", deliveredAt: null }),
      ],
      "2026-10-05",
      "2026-10-05",
    );
    expect(r.totals).toMatchObject({
      orders: 4,
      delivered: 3,
      cancelled: 1,
      cancelRate: 0.25,
      revenueKurus: 120_000,
      avgOrderKurus: 40_000,
      avgDeliveryMin: Math.round((45 + 50 + 90) / 3),
      urgentDelivered: 2,
      urgentOnTimeRate: 0.5,
    });
    expect(r.totals.crossSideRate).toBeCloseTo(1 / 3);
  });

  it("günlük seri boş günleri de içerir, İstanbul tarihine göre", () => {
    const r = buildReport(
      [o({ createdAt: "2026-10-05T22:30:00Z", deliveredAt: "2026-10-05T23:00:00Z" })], // 6 Ekim 01:30 / 02:00
      "2026-10-05",
      "2026-10-07",
    );
    expect(r.daily.map((d) => [d.date, d.orders, d.delivered])).toEqual([
      ["2026-10-05", 0, 0],
      ["2026-10-06", 1, 1],
      ["2026-10-07", 0, 0],
    ]);
    expect(r.hourly[1]!.orders).toBe(1);
  });

  it("kurye ve müşteri sıralamaları", () => {
    const r = buildReport(
      [o({ id: "1" }), o({ id: "2", courierId: "k2", courierName: "Emre" }), o({ id: "3", customerId: "c2", customerName: "Ali", subtotalKurus: 90_000 })],
      "2026-10-05",
      "2026-10-05",
    );
    expect(r.couriers[0]).toEqual({ courierId: "k1", name: "Mehmet", delivered: 2, revenueKurus: 130_000, avgDeliveryMin: 45, avgRating: null });
    expect(r.customers.map((c) => c.name)).toEqual(["Ali", "Ayşe"]);
    expect(r.customerCount).toBe(2);
  });

  it("CSV: BOM, noktalı virgül, ondalık virgül ve tırnaklama", () => {
    const csv = ordersCsv([o({ pickupAddress: 'Moda Cad. "No: 5"; Kadıköy', subtotalKurus: 123_450 })]);
    expect(csv.startsWith("\uFEFFSipariş no;Oluşturma;")).toBe(true);
    const row = csv.split("\r\n")[1]!;
    expect(row).toContain("YK-1;2026-10-05 10:00;2026-10-05 10:45;Teslim edildi;Ayşe;");
    expect(row).toContain('"Moda Cad. ""No: 5""; Kadıköy"');
    expect(row).toContain(";5,0;Hayır;Mehmet;nakit;1234,50;480,00;45");
  });
});

describe("raporlar: değerlendirmeler", () => {
  it("ortalama, dağılım, kurye ortalaması ve düşük puanlar", () => {
    const rating = (orderId: string, score: number, courierId: string | null, createdAt: string) => ({
      orderId,
      orderNo: orderId,
      score,
      comment: null,
      courierId,
      courierName: null,
      customerName: null,
      createdAt,
    });
    const r = buildReport(
      [o({ id: "1" }), o({ id: "2" }), o({ id: "3", courierId: "k2", courierName: "Emre" })],
      "2026-10-05",
      "2026-10-05",
      [rating("1", 5, "k1", "2026-10-05T09:00:00Z"), rating("2", 2, "k1", "2026-10-05T10:00:00Z"), rating("3", 3, "k2", "2026-10-05T08:00:00Z")],
    );
    expect(r.totals.avgRating).toBe(3.3);
    expect(r.totals.ratingCount).toBe(3);
    expect(r.totals.ratingRate).toBe(1);
    expect(r.ratingDist).toEqual([0, 1, 1, 0, 1]);
    expect(r.couriers.find((c) => c.courierId === "k1")!.avgRating).toBe(3.5);
    expect(r.lowRatings.map((x) => x.orderId)).toEqual(["2", "3"]);
    expect(buildReport([], "2026-10-05", "2026-10-05").totals.avgRating).toBeNull();
  });
});
