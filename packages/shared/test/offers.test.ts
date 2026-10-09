import { describe, expect, it } from "vitest";
import { acceptanceStats, excludedCouriers, isOfferPending, offerSecondsLeft } from "../offers.ts";

const now = new Date("2026-10-12T10:00:00Z");

describe("iş teklifi", () => {
  it("bekleyen teklif: atanmış, süresi var, kabul yok", () => {
    expect(isOfferPending({ status: "kuryeye_atandi", offerExpiresAt: now.toISOString(), offerAcceptedAt: null })).toBe(true);
    expect(isOfferPending({ status: "kuryeye_atandi", offerExpiresAt: now.toISOString(), offerAcceptedAt: now.toISOString() })).toBe(false);
    // Doğrudan (yönetici) atama teklif değildir
    expect(isOfferPending({ status: "kuryeye_atandi", offerExpiresAt: null, offerAcceptedAt: now.toISOString() })).toBe(false);
    expect(isOfferPending({ status: "onaylandi", offerExpiresAt: now.toISOString(), offerAcceptedAt: null })).toBe(false);
  });

  it("kalan süre yukarı yuvarlanır, eksiye inmez", () => {
    expect(offerSecondsLeft("2026-10-12T10:00:42.300Z", now)).toBe(43);
    expect(offerSecondsLeft("2026-10-12T09:59:00Z", now)).toBe(0);
  });

  it("reddeden kalıcı, süresi dolan 10 dk dışlanır", () => {
    const ex = excludedCouriers(
      [
        { orderId: "o1", courierId: "k1", response: "ret", respondedAt: "2026-10-12T08:00:00Z" },
        { orderId: "o1", courierId: "k2", response: "zaman_asimi", respondedAt: "2026-10-12T09:55:00Z" },
        { orderId: "o1", courierId: "k3", response: "zaman_asimi", respondedAt: "2026-10-12T09:40:00Z" },
        { orderId: "o1", courierId: "k4", response: "geri_alindi", respondedAt: "2026-10-12T09:59:00Z" },
        { orderId: "o2", courierId: "k1", response: "kabul", respondedAt: "2026-10-12T09:59:00Z" },
      ],
      now,
    );
    expect(ex.get("o1")).toEqual(["k1", "k2"]);
    expect(ex.has("o2")).toBe(false);
  });

  it("kabul oranı geri alınan ve bekleyenleri saymaz", () => {
    expect(acceptanceStats(["kabul", "kabul", "kabul", "ret", "zaman_asimi", "geri_alindi", null])).toEqual({
      offered: 5,
      accepted: 3,
      declined: 1,
      timedOut: 1,
      rate: 0.6,
    });
    expect(acceptanceStats([]).rate).toBeNull();
  });
});
