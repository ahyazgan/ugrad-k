import { describe, expect, it } from "vitest";
import {
  describeCorporateTiers,
  describeKmTiers,
  formatCorporateTiers,
  formatKmTiers,
  parseCap,
  parseCorporateTiers,
  parseKmTiers,
} from "../src/lib/pricing-form";

describe("km kademeleri", () => {
  it("metin ↔ kademe gidiş-dönüş", () => {
    const tiers = parseKmTiers("10:25, *:18");
    expect(tiers).toEqual([
      { uptoKm: 10, perKmKurus: 2500 },
      { uptoKm: null, perKmKurus: 1800 },
    ]);
    expect(formatKmTiers(tiers!)).toBe("10:25, *:18");
  });
  it("ondalık TL ve boş metin", () => {
    expect(parseKmTiers("10:22.5")).toEqual([{ uptoKm: 10, perKmKurus: 2250 }]);
    expect(parseKmTiers("")).toEqual([]);
  });
  it("geçersiz girdiler reddedilir", () => {
    expect(parseKmTiers("10:25:3")).toBeNull();
    expect(parseKmTiers("*:18, *:20")).toBeNull();
    expect(parseKmTiers("10:25, 10:20")).toBeNull();
    expect(parseKmTiers("0:25")).toBeNull();
    expect(parseKmTiers("10:-1")).toBeNull();
  });
  it("sade anlatım sıralı", () => {
    expect(describeKmTiers([{ uptoKm: null, perKmKurus: 1800 }, { uptoKm: 10, perKmKurus: 2500 }])).toBe(
      "10 km'ye kadar 25 TL/km, üstü 18 TL/km",
    );
  });
});

describe("ek ücret tavanı", () => {
  it("boş → tavan yok, virgüllü sayı, geçersiz", () => {
    expect(parseCap("")).toBeNull();
    expect(parseCap("75")).toBe(75);
    expect(parseCap("62,5")).toBe(62.5);
    expect(parseCap("abc")).toBeUndefined();
    expect(parseCap("-5")).toBeUndefined();
  });
});

describe("kurumsal kademeler", () => {
  it("metin ↔ kademe gidiş-dönüş ve anlatım", () => {
    const tiers = parseCorporateTiers("50:25, 20:15");
    expect(tiers).toEqual([
      { minDeliveries: 50, discountPct: 25 },
      { minDeliveries: 20, discountPct: 15 },
    ]);
    expect(formatCorporateTiers(tiers!)).toBe("50:25, 20:15");
    expect(describeCorporateTiers(tiers!)).toBe("ayda 20+ teslimatta %15, 50+ teslimatta %25");
  });
  it("eksik veya geçersiz parça reddedilir", () => {
    expect(parseCorporateTiers("20:")).toBeNull();
    expect(parseCorporateTiers(":15")).toBeNull();
    expect(parseCorporateTiers("20:15:1")).toBeNull();
    expect(parseCorporateTiers("20:x")).toBeNull();
    expect(parseCorporateTiers("")).toEqual([]);
  });
});
