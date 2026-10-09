import { describe, expect, it } from "vitest";
import { courierBalance } from "../cost.ts";
import {
  closedIncentivePeriods,
  inIncentiveScope,
  incentiveAwardKurus,
  incentiveProblem,
  incentiveProgress,
  incentiveScope,
  type Incentive,
} from "../incentives.ts";

const hedef: Incentive = {
  title: "Günlük hedef",
  kind: "hedef",
  period: "gunluk",
  tiers: [
    { target: 10, rewardKurus: 15_000 },
    { target: 15, rewardKurus: 30_000 },
  ],
  bonusPct: null,
  weekdays: null,
  startHour: 0,
  endHour: 24,
  startsOn: "2026-10-12",
  endsOn: null,
};

describe("hedef primleri", () => {
  it("kural kontrolü", () => {
    expect(incentiveProblem(hedef)).toBeNull();
    expect(incentiveProblem({ ...hedef, tiers: [{ target: 10, rewardKurus: 15_000 }, { target: 8, rewardKurus: 30_000 }] })).toMatch(/artan/);
    expect(incentiveProblem({ ...hedef, tiers: [] })).toMatch(/kademesi/);
    expect(incentiveProblem({ ...hedef, kind: "yuzde", bonusPct: 0 })).toMatch(/1–100/);
    expect(incentiveProblem({ ...hedef, startHour: 20, endHour: 8 })).toMatch(/Saat/);
    expect(incentiveProblem({ ...hedef, endsOn: "2026-10-01" })).toMatch(/Bitiş/);
  });

  it("ilerleme: sonraki kademe ve kazanılan", () => {
    expect(incentiveProgress(hedef, 7, 0)).toMatchObject({ rewardKurus: 0, next: { target: 10, remaining: 3 } });
    expect(incentiveProgress(hedef, 12, 0).text).toBe("bugün 12/15 iş · 3 iş daha → 300,00 TL");
    expect(incentiveProgress(hedef, 16, 0)).toMatchObject({ rewardKurus: 30_000, next: null });
    expect(incentiveProgress({ ...hedef, kind: "yuzde", bonusPct: 10, period: "haftalik" }, 4, 80_000).text).toBe("bu hafta 4 iş · +%10 ile 80,00 TL ek");
  });

  it("kapsam metni", () => {
    expect(incentiveScope(hedef)).toBe("Her gün");
    expect(incentiveScope({ weekdays: [1, 2, 3, 4, 5], startHour: 8, endHour: 20 })).toBe("Hafta içi 08:00–20:00");
    expect(incentiveScope({ weekdays: [7, 6], startHour: 0, endHour: 24 })).toBe("Cmt, Paz");
    expect(incentiveScope({ weekdays: [5], startHour: 18, endHour: 24 })).toBe("Cum 18:00–24:00");
  });

  it("kapsam: İstanbul günü ve saati", () => {
    const hafta = { weekdays: [6, 7], startHour: 8, endHour: 20 };
    // 2026-10-10 Cumartesi 07:30 UTC = 10:30 İstanbul
    expect(inIncentiveScope(hafta, "2026-10-10T07:30:00Z")).toBe(true);
    // 17:30 UTC = 20:30 İstanbul (aralık dışı)
    expect(inIncentiveScope(hafta, "2026-10-10T17:30:00Z")).toBe(false);
    // Cuma 22:30 UTC = Cumartesi 01:30 İstanbul: gün uyar, saat uymaz
    expect(inIncentiveScope({ ...hafta, startHour: 0 }, "2026-10-09T22:30:00Z")).toBe(true);
    expect(inIncentiveScope(hafta, "2026-10-09T10:00:00Z")).toBe(false);
  });

  it("kapanmış dönemler: günlük ve haftalık (Pazartesi başlar), kampanya aralığıyla kesişim", () => {
    expect(closedIncentivePeriods({ period: "gunluk", startsOn: "2026-10-05", endsOn: null }, "2026-10-08").map((p) => p.periodStart)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
    // Bitiş tarihinden sonrası yok
    expect(closedIncentivePeriods({ period: "gunluk", startsOn: "2026-10-05", endsOn: "2026-10-05" }, "2026-10-08")).toHaveLength(1);
    // Haftalık: 2026-10-08 Perşembe → bu hafta kapanmadı; geçen hafta (28 Eyl–4 Eki) kampanya 1 Eki başladığı için 1–4 Eki sayılır
    expect(closedIncentivePeriods({ period: "haftalik", startsOn: "2026-10-01", endsOn: null }, "2026-10-08")).toEqual([
      { periodStart: "2026-09-28", periodEnd: "2026-10-04", countFrom: "2026-10-01", countTo: "2026-10-04" },
    ]);
    // En fazla son 14 gün
    expect(closedIncentivePeriods({ period: "gunluk", startsOn: "2026-01-01", endsOn: null }, "2026-10-08")).toHaveLength(14);
  });

  it("dönem ödülü", () => {
    expect(incentiveAwardKurus(hedef, 9, 0)).toBe(0);
    expect(incentiveAwardKurus(hedef, 14, 0)).toBe(15_000);
    expect(incentiveAwardKurus(hedef, 20, 0)).toBe(30_000);
    expect(incentiveAwardKurus({ kind: "yuzde", tiers: [], bonusPct: 12.5 }, 3, 40_001)).toBe(5_000);
  });

  it("kurye bakiyesi primleri içerir", () => {
    expect(courierBalance([{ totalKurus: 50_000, cashCollectedKurus: 20_000 }], 15_000)).toEqual({
      deliveries: 1,
      earningsKurus: 50_000,
      cashKurus: 20_000,
      incentiveKurus: 15_000,
      netKurus: 45_000,
    });
  });
});
