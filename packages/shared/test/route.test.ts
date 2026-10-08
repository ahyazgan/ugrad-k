import { describe, expect, it } from "vitest";
import { planStops, stopsDirectionsUrl, type RouteJob } from "../route.ts";

const NOW = new Date("2026-10-12T10:00:00Z");
const P = (lat: number, lng: number, address = "x") => ({ lat, lng, address });
// Beykoz (kurye), Kavacık, Üsküdar, Kadıköy, Levent
const BEYKOZ = P(41.13, 29.11);
const KAVACIK = P(41.09, 29.09, "Kavacık");
const USKUDAR = P(41.026, 29.016, "Üsküdar");
const KADIKOY = P(40.99, 29.03, "Kadıköy");
const LEVENT = P(41.08, 29.01, "Levent");

const job = (id: string, status: RouteJob["status"], pickup: typeof BEYKOZ, dropoff: typeof BEYKOZ, over: Partial<RouteJob> = {}): RouteJob => ({
  id,
  orderNo: `YK-${id}`,
  status,
  pickup,
  dropoff,
  ...over,
});

describe("durak sırası", () => {
  it("alış her zaman aynı işin tesliminden önce gelir", () => {
    const stops = planStops([job("1", "kuryeye_atandi", USKUDAR, KAVACIK), job("2", "kuryeye_atandi", KAVACIK, USKUDAR)], BEYKOZ, NOW);
    expect(stops).toHaveLength(4);
    for (const id of ["1", "2"]) {
      const a = stops.findIndex((s) => s.jobId === id && s.kind === "alis");
      const t = stops.findIndex((s) => s.jobId === id && s.kind === "teslim");
      expect(a).toBeLessThan(t);
    }
    // Varış süreleri artan
    for (let i = 1; i < stops.length; i++) expect(stops[i]!.etaMinutes).toBeGreaterThan(stops[i - 1]!.etaMinutes);
  });

  it("yoldaki iş yalnız teslim durağıdır; yakın olan önce", () => {
    const stops = planStops([job("1", "yolda", BEYKOZ, KADIKOY), job("2", "alindi", BEYKOZ, KAVACIK)], BEYKOZ, NOW);
    expect(stops.map((s) => `${s.jobId}:${s.kind}`)).toEqual(["2:teslim", "1:teslim"]);
  });

  it("acil taahhüt kaçacaksa uzak da olsa önce gidilir", () => {
    const due = new Date(NOW.getTime() + 35 * 60_000).toISOString();
    const relaxed = planStops([job("1", "yolda", BEYKOZ, LEVENT), job("2", "yolda", BEYKOZ, KAVACIK)], BEYKOZ, NOW);
    expect(relaxed[0]!.jobId).toBe("2");
    const urgent = planStops(
      [job("1", "yolda", BEYKOZ, LEVENT, { urgent: true, slaDueAt: due }), job("2", "yolda", BEYKOZ, KAVACIK)],
      BEYKOZ,
      NOW,
    );
    expect(urgent[0]!.jobId).toBe("1");
    expect(urgent[0]!.late).toBe(false);
  });

  it("iade dönüşü göndericiye teslim durağıdır; teslim edilmiş iş durak değildir", () => {
    const stops = planStops([job("1", "geri_donuyor", USKUDAR, KADIKOY), job("2", "teslim_edildi", BEYKOZ, LEVENT)], KADIKOY, NOW);
    expect(stops.map((s) => `${s.jobId}:${s.kind}:${s.address}`)).toEqual(["1:iade:Üsküdar"]);
  });

  it("konum yoksa da sıralar; Google Haritalar bağlantısı ara noktalı", () => {
    const stops = planStops([job("1", "kuryeye_atandi", USKUDAR, KADIKOY)], null, NOW);
    expect(stops.map((s) => s.kind)).toEqual(["alis", "teslim"]);
    expect(stopsDirectionsUrl(stops)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=40.990000,29.030000&waypoints=41.026000%2C29.016000&travelmode=driving",
    );
    expect(stopsDirectionsUrl([])).toBeNull();
  });

  it("çok durakta (en yakın uygun durak) da kural bozulmaz", () => {
    const jobs = Array.from({ length: 5 }, (_, i) => job(String(i), "kuryeye_atandi", i % 2 ? USKUDAR : KAVACIK, i % 2 ? LEVENT : KADIKOY));
    const stops = planStops(jobs, BEYKOZ, NOW);
    expect(stops).toHaveLength(10);
    for (const j of jobs) {
      expect(stops.findIndex((s) => s.jobId === j.id && s.kind === "alis")).toBeLessThan(stops.findIndex((s) => s.jobId === j.id && s.kind === "teslim"));
    }
  });
});
