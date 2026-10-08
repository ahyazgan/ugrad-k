import { describe, expect, it } from "vitest";
import { ORDER_STATUSES, ORDER_TRANSITIONS, canTransition, isFinalStatus } from "../orders.ts";

describe("sipariş durumları", () => {
  it("ana akış sırayla ilerler", () => {
    const flow = ["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda", "teslim_edildi"] as const;
    for (let i = 0; i < flow.length - 1; i++) {
      expect(canTransition(flow[i]!, flow[i + 1]!)).toBe(true);
    }
  });

  it("adım atlanamaz", () => {
    expect(canTransition("beklemede", "yolda")).toBe(false);
    expect(canTransition("onaylandi", "teslim_edildi")).toBe(false);
  });

  it("teslim edilmiş ve iptal son durumdur", () => {
    expect(isFinalStatus("teslim_edildi")).toBe(true);
    expect(isFinalStatus("iptal")).toBe(true);
    expect(isFinalStatus("sorunlu")).toBe(false);
  });

  it("paket alındıktan sonra iptal edilemez", () => {
    expect(canTransition("alindi", "iptal")).toBe(false);
    expect(canTransition("yolda", "iptal")).toBe(false);
  });

  it("geçiş tablosu yalnızca bilinen durumları içerir", () => {
    for (const targets of Object.values(ORDER_TRANSITIONS)) {
      for (const t of targets) expect(ORDER_STATUSES).toContain(t);
    }
  });
});
