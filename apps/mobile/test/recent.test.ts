import { describe, expect, it } from "vitest";
import { districtFromAddress, recentPlaces } from "../src/lib/recent";
import type { OrderSummary } from "../src/lib/api/types";

const order = (id: string, createdAt: string, from: string, to: string, extra: Partial<OrderSummary> = {}): OrderSummary => ({
  id,
  orderNo: `YK-${id}`,
  status: "teslim_edildi",
  pickupAddress: from,
  dropoffAddress: to,
  totalKurus: 0,
  urgent: false,
  createdAt,
  pickupPoint: { lat: 41.1295, lng: 29.1135 },
  dropoffPoint: { lat: 41.0819, lng: 29.0106 },
  ...extra,
});

describe("districtFromAddress", () => {
  it("reads a known Istanbul district before /İstanbul", () => {
    expect(districtFromAddress("Levent Mah., Büyükdere Cad., Beşiktaş/İstanbul")).toBe("Beşiktaş");
    expect(districtFromAddress("Kılıçlı Mah. Şile Cad. No: 8A, Beykoz/İstanbul")).toBe("Beykoz");
  });
  it("returns null for unknown or missing districts", () => {
    expect(districtFromAddress("Bilinmeyen Sok.")).toBeNull();
    expect(districtFromAddress("X Mah., Çankaya/Ankara")).toBeNull();
  });
});

describe("recentPlaces", () => {
  const BEYKOZ = "Kılıçlı Mah. Şile Cad. No: 8A, Beykoz/İstanbul";
  const LEVENT = "Levent Mah., Büyükdere Cad., Beşiktaş/İstanbul";
  const MODA = "Caferağa Mah., Moda Cad., Kadıköy/İstanbul";

  it("lists newest first, drop-off before pick-up, without duplicates", () => {
    const list = recentPlaces([
      order("1", "2026-10-01T10:00:00Z", BEYKOZ, LEVENT),
      order("2", "2026-10-05T10:00:00Z", BEYKOZ, MODA, { dropoffPoint: { lat: 40.9877, lng: 29.0275 } }),
    ]);
    expect(list.map((p) => p.address)).toEqual([MODA, BEYKOZ, LEVENT]);
    expect(list[0]).toMatchObject({ district: "Kadıköy", side: "anadolu", label: "Kadıköy · Caferağa Mah." });
    expect(list[2]).toMatchObject({ district: "Beşiktaş", side: "avrupa" });
  });

  it("skips cancelled orders and orders without coordinates, and respects the limit", () => {
    const list = recentPlaces(
      [
        order("1", "2026-10-01T10:00:00Z", BEYKOZ, LEVENT, { status: "iptal" }),
        order("2", "2026-10-02T10:00:00Z", BEYKOZ, MODA, { dropoffPoint: undefined }),
      ],
      1,
    );
    expect(list.map((p) => p.address)).toEqual([BEYKOZ]);
  });
});
