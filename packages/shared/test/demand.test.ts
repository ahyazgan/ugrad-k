import { describe, expect, it } from "vitest";
import {
  aggregateDemand,
  demandCell,
  demandDataNote,
  demandHotspots,
  demandMatrix,
  districtFromAddress,
  istanbulWeekHour,
  staffingAdvice,
  uncoveredDemand,
  upcomingHotspots,
  type DemandData,
  type DemandOrder,
  type ShiftSlotTemplate,
} from "../demand.ts";

const KADIKOY = { lat: 40.9905, lng: 29.0291 };
const BEYKOZ = { lat: 41.1338, lng: 29.0931 };
const NOW = new Date("2026-10-08T12:00:00Z"); // Perşembe 15:00 İstanbul

const order = (at: string, pickup = KADIKOY, over: Partial<DemandOrder> = {}): DemandOrder => ({
  at,
  pickup,
  pickupAddress: "Caferağa Mah., Moda Cad., Kadıköy/İstanbul",
  cancelled: false,
  ...over,
});

describe("talep yoğunluğu", () => {
  it("hücre merkezi ve İstanbul saati", () => {
    expect(demandCell(KADIKOY)).toEqual({ lat: 40.995, lng: 29.0355 });
    // Tam sınırda kayan nokta hatası olmamalı
    expect(demandCell({ lat: 41.02, lng: 29.016 })).toEqual({ lat: 41.025, lng: 29.0225 });
    expect(istanbulWeekHour("2026-10-08T21:30:00Z")).toEqual({ weekday: 5, hour: 0 }); // Cuma 00:30
    expect(istanbulWeekHour("2026-10-11T20:59:00Z")).toEqual({ weekday: 7, hour: 23 });
  });

  it("adresten ilçe", () => {
    expect(districtFromAddress("Kılıçlı Mah. Şile Cad. No: 8A, Beykoz/İstanbul")).toBe("Beykoz");
    expect(districtFromAddress("Levent, 34330 Beşiktaş / İstanbul, Türkiye")).toBe("Beşiktaş");
    expect(districtFromAddress("Ankara")).toBeNull();
    expect(districtFromAddress(null)).toBeNull();
  });

  it("toplama: iptal, dönem dışı ve gelecek sayılmaz; hafta sayısı ilk siparişten", () => {
    const d = aggregateDemand(
      [
        order("2026-10-01T09:10:00Z"), // Perşembe 12:10
        order("2026-10-01T09:40:00Z"),
        order("2026-09-24T09:20:00Z"), // bir hafta önce, aynı saat
        order("2026-10-01T09:30:00Z", KADIKOY, { cancelled: true }),
        order("2026-10-09T09:00:00Z"), // gelecek
        order("2025-01-01T09:00:00Z"), // 56 günden eski
        order("2026-10-02T06:00:00Z", BEYKOZ, { pickupAddress: "Kılıçlı Mah., Beykoz/İstanbul" }),
      ],
      NOW,
    );
    expect(d.weeks).toBe(2); // 24 Eyl 12:20 → 8 Eki 15:00
    expect(d.rows).toHaveLength(2);
    expect(d.rows.find((r) => r.district === "Kadıköy")).toMatchObject({ weekday: 4, hour: 12, orders: 3, lat: 40.995 });
    // Kurye görünümü: az siparişli hücre gizli
    expect(aggregateDemand([order("2026-10-01T09:10:00Z"), order("2026-10-02T06:00:00Z", BEYKOZ)], NOW, { minOrders: 3 }).rows).toEqual([]);
    expect(aggregateDemand([], NOW).weeks).toBe(1);
  });

  const data: DemandData = {
    weeks: 2,
    rows: [
      { weekday: 4, hour: 15, lat: 40.995, lng: 29.0225, orders: 8, district: "Kadıköy" },
      { weekday: 4, hour: 16, lat: 40.995, lng: 29.0225, orders: 4, district: "Kadıköy" },
      { weekday: 4, hour: 15, lat: 41.025, lng: 29.0225, orders: 6, district: "Üsküdar" },
      { weekday: 4, hour: 9, lat: 41.135, lng: 29.0875, orders: 20, district: "Beykoz" },
      { weekday: 6, hour: 23, lat: 41.135, lng: 29.0875, orders: 2, district: "Beykoz" },
    ],
  };

  it("haftalık tablo ve sıcak bölgeler", () => {
    const m = demandMatrix(data);
    expect(m[3]![15]).toBe(7);
    expect(m[3]![9]).toBe(10);
    expect(m[5]![23]).toBe(1);
    const all = demandHotspots(data);
    expect(all[0]).toMatchObject({ district: "Beykoz", perWeek: 11, intensity: 1 });
    expect(all.reduce((s, h) => s + h.share, 0)).toBeCloseTo(1);
    const afternoon = demandHotspots(data, { when: (w, h) => w === 4 && h >= 15 });
    expect(afternoon.map((h) => h.district)).toEqual(["Kadıköy", "Üsküdar"]);
    expect(afternoon[1]!.intensity).toBe(0.5);
  });

  it("kurye: bu ve sonraki saatin yoğun bölgeleri, uzaklıkla", () => {
    const up = upcomingHotspots(data, NOW, { from: KADIKOY });
    expect(up.map((h) => h.district)).toEqual(["Kadıköy", "Üsküdar"]);
    expect(up[0]!.perWeek).toBe(6);
    expect(up[0]!.distanceKm).toBeLessThan(1);
    // Cumartesi 23:30 → Pazar 00:00 da bakılır
    expect(upcomingHotspots(data, new Date("2026-10-10T20:30:00Z")).map((h) => h.district)).toEqual(["Beykoz"]);
  });

  it("vardiya önerisi ve kapsanmayan saatler", () => {
    const templates: ShiftSlotTemplate[] = [
      { id: 1, weekday: 4, startTime: "08:00", endTime: "12:00", required: 2, active: true },
      { id: 2, weekday: 4, startTime: "12:00", endTime: "16:00", required: 2, active: true },
      { id: 3, weekday: 4, startTime: "16:00", endTime: "20:00", required: 2, active: true },
      { id: 4, weekday: 1, startTime: "08:00", endTime: "12:00", required: 1, active: true },
      { id: 5, weekday: 4, startTime: "20:00", endTime: "24:00", required: 1, active: false },
    ];
    const advice = staffingAdvice(demandMatrix(data), templates);
    expect(advice.map((a) => [a.templateId, a.suggested, a.verdict])).toEqual([
      [4, 0, "azalt"], // Pazartesi talep yok
      [1, 7, "artir"], // 10 sipariş/saat ÷ 1,5
      [2, 5, "artir"], // 7 ÷ 1,5 → 5
      [3, 2, "uygun"], // 2 ÷ 1,5 → 2
    ]);
    expect(staffingAdvice(demandMatrix(data), templates, 3)[1]).toMatchObject({ suggested: 4, peakPerHour: 10 });
    expect(uncoveredDemand(demandMatrix(data), templates)).toEqual([{ weekday: 6, hour: 23, perWeek: 1 }]);
  });

  it("az veri uyarısı", () => {
    expect(demandDataNote({ weeks: 1, rows: [] })).toBe("Bu dönemde sipariş yok.");
    expect(demandDataNote(data)).toBeNull();
    expect(demandDataNote({ ...data, weeks: 1.5 })).toBe("Az veri (40 sipariş, 1,5 hafta): öneriler kaba tahmindir.");
    expect(demandDataNote({ weeks: 4, rows: [{ ...data.rows[0]!, orders: 12 }] })).toMatch(/^Az veri \(12 sipariş/);
  });
});
