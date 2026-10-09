import { describe, expect, it } from "vitest";
import { etaAt, etaMinutes, HANDOVER_MINUTES, slaState, UNASSIGNED_BUFFER_MINUTES } from "../eta.ts";
import { applyCredit, calculatePrice, DEFAULT_PRICING_SETTINGS as S, urgentSurchargeKurus } from "../pricing.ts";

const BEYKOZ = { lat: 41.1295, lng: 29.1135 };
const LEVENT = { lat: 41.0821, lng: 29.0106 };
const order = (status: Parameters<typeof etaMinutes>[0]["status"]) => ({ status, pickup: BEYKOZ, dropoff: LEVENT, durationSeconds: 30 * 60 });

describe("ETA", () => {
  it("duruma göre kalan süre", () => {
    expect(etaMinutes(order("onaylandi"), null)).toBe(UNASSIGNED_BUFFER_MINUTES + HANDOVER_MINUTES + 30);
    // Kurye alışta: yalnız teslim alma + yol
    expect(etaMinutes(order("kuryeye_atandi"), BEYKOZ)).toBe(HANDOVER_MINUTES + 30);
    expect(etaMinutes(order("yolda"), LEVENT)).toBe(0);
    const mid = etaMinutes(order("yolda"), { lat: 41.1, lng: 29.06 })!;
    expect(mid).toBeGreaterThan(5);
    expect(mid).toBeLessThan(30);
    expect(etaMinutes(order("teslim_edildi"), null)).toBeNull();
  });

  it("etaAt dakikaya yukarı yuvarlar", () => {
    const now = new Date("2026-10-08T10:00:00Z");
    expect(etaAt(order("kuryeye_atandi"), BEYKOZ, now)!.toISOString()).toBe("2026-10-08T10:35:00.000Z");
  });
});

describe("SLA", () => {
  const due = "2026-10-08T11:00:00Z";
  const now = new Date("2026-10-08T10:30:00Z");
  it("zamanında / riskli / gecikti / karşılandı / kaçırıldı", () => {
    const o = { slaDueAt: due, deliveredAt: null, status: "yolda" as const };
    expect(slaState(o, new Date("2026-10-08T10:50:00Z"), now)).toBe("zamaninda");
    expect(slaState(o, new Date("2026-10-08T11:05:00Z"), now)).toBe("riskli");
    expect(slaState(o, null, new Date("2026-10-08T11:01:00Z"))).toBe("gecikti");
    expect(slaState({ ...o, status: "teslim_edildi", deliveredAt: "2026-10-08T10:59:00Z" }, null, now)).toBe("karsilandi");
    expect(slaState({ ...o, status: "teslim_edildi", deliveredAt: "2026-10-08T11:02:00Z" }, null, now)).toBe("kacirildi");
    expect(slaState({ ...o, slaDueAt: null }, null, now)).toBeNull();
  });
});

describe("telafi kredisi", () => {
  it("acil ek ücreti kadar kredi, ara toplamı aşmaz, KDV yeniden hesaplanır", () => {
    const urgent = calculatePrice({ distanceMeters: 5_000, serviceLevel: "acil", pickupAt: new Date("2026-10-07T08:00:00Z") }, S);
    const credit = urgentSurchargeKurus(urgent);
    expect(credit).toBe(20_000);
    const next = calculatePrice({ distanceMeters: 5_000, pickupAt: new Date("2026-10-07T08:00:00Z") }, S);
    const r = applyCredit(next, credit, "Gecikme telafisi (YK-1001)");
    expect(r.usedKurus).toBe(20_000);
    expect(r.quote.subtotalKurus).toBe(20_000);
    expect(r.quote.vatKurus).toBe(4_000);
    expect(r.quote.lines.at(-1)).toEqual({ code: "credit", label: "Gecikme telafisi (YK-1001)", amountKurus: -20_000 });
    expect(applyCredit(next, 999_999, "x").quote.subtotalKurus).toBe(0);
    expect(applyCredit(next, 0, "x").quote).toBe(next);
  });
});
