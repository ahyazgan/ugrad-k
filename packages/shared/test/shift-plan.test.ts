import { describe, expect, it } from "vitest";
import { attendance, coverageState, slotLabel } from "../shift-plan.ts";

const slot = { startsAt: "2026-10-12T05:00:00Z", endsAt: "2026-10-12T09:00:00Z", cancelledAt: null, lateCancel: false }; // 08–12 İstanbul

describe("vardiya planı", () => {
  it("dilim etiketi İstanbul saatiyle; gece yarısı 24:00", () => {
    expect(slotLabel(slot.startsAt, slot.endsAt)).toBe("08:00–12:00");
    expect(slotLabel("2026-10-12T17:00:00Z", "2026-10-12T21:00:00Z")).toBe("20:00–24:00");
  });

  it("dilimin yarısından fazla çalışıldıysa geldi; geç kalma dakikası", () => {
    const after = new Date("2026-10-12T10:00:00Z");
    expect(attendance(slot, [{ startedAt: "2026-10-12T05:20:00Z", endedAt: "2026-10-12T09:30:00Z" }], after)).toEqual({
      status: "geldi",
      overlapMinutes: 220,
      lateMinutes: 20,
    });
    expect(attendance(slot, [{ startedAt: "2026-10-12T07:30:00Z", endedAt: "2026-10-12T09:00:00Z" }], after).status).toBe("gelmedi");
    expect(attendance(slot, [], after).status).toBe("gelmedi");
  });

  it("sürerken: açtıysa geldi, 15 dk geçip açmadıysa gelmedi; başlamadıysa bekliyor; iptaller", () => {
    expect(attendance(slot, [], new Date("2026-10-12T05:10:00Z")).status).toBe("bekliyor");
    expect(attendance(slot, [], new Date("2026-10-12T05:20:00Z")).status).toBe("gelmedi");
    expect(attendance(slot, [{ startedAt: "2026-10-12T05:05:00Z", endedAt: null }], new Date("2026-10-12T05:20:00Z")).status).toBe("geldi");
    expect(attendance(slot, [], new Date("2026-10-11T05:00:00Z")).status).toBe("bekliyor");
    expect(attendance({ ...slot, cancelledAt: "x", lateCancel: true }, []).status).toBe("gec_iptal");
  });

  it("doluluk", () => {
    expect(coverageState({ required: 2, booked: 2 })).toEqual({ missing: 0, state: "tamam" });
    expect(coverageState({ required: 2, booked: 1 })).toEqual({ missing: 1, state: "eksik" });
    expect(coverageState({ required: 2, booked: 0 })).toEqual({ missing: 2, state: "bos" });
    expect(coverageState({ required: 0, booked: 1 }).state).toBe("gereksiz");
  });
});
