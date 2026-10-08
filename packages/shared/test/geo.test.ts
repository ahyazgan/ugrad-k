import { describe, expect, it } from "vitest";
import { countBridgeCrossings, resolveSide, sideFromDistrict, sideFromLatLng } from "../geo.ts";

describe("yaka tespiti", () => {
  it("ilçe adından (büyük/küçük harf ve Türkçe karakterden bağımsız)", () => {
    expect(sideFromDistrict("Beykoz")).toBe("anadolu");
    expect(sideFromDistrict("ÜSKÜDAR")).toBe("anadolu");
    expect(sideFromDistrict("uskudar")).toBe("anadolu");
    expect(sideFromDistrict("Şişli")).toBe("avrupa");
    expect(sideFromDistrict("Eyüp")).toBe("avrupa");
    expect(sideFromDistrict("Gebze")).toBeNull();
    expect(sideFromDistrict(null)).toBeNull();
  });

  it.each([
    ["Beykoz merkez", 41.1295, 29.1135, "anadolu"],
    ["Kadıköy Moda", 40.9877, 29.0275, "anadolu"],
    ["Üsküdar", 41.0262, 29.0156, "anadolu"],
    ["Beylerbeyi", 41.045, 29.045, "anadolu"],
    ["Kanlıca", 41.099, 29.067, "anadolu"],
    ["Anadolukavağı", 41.17, 29.087, "anadolu"],
    ["Kartal", 40.889, 29.1856, "anadolu"],
    ["Ortaköy", 41.047, 29.027, "avrupa"],
    ["Bebek", 41.077, 29.043, "avrupa"],
    ["Rumelihisarı", 41.085, 29.056, "avrupa"],
    ["Tarabya", 41.137, 29.06, "avrupa"],
    ["Sarıyer", 41.167, 29.057, "avrupa"],
    ["Levent", 41.0819, 29.0106, "avrupa"],
    ["Sirkeci", 41.015, 28.977, "avrupa"],
    ["Bakırköy", 40.9819, 28.8772, "avrupa"],
  ])("koordinattan: %s", (_name, lat, lng, side) => {
    expect(sideFromLatLng({ lat, lng })).toBe(side);
  });

  it("ilçe bilgisi koordinattan önceliklidir", () => {
    expect(resolveSide({ lat: 41.08, lng: 29.0 }, "Üsküdar")).toBe("anadolu");
    expect(resolveSide({ lat: 41.08, lng: 29.0 }, "Gebze")).toBe("avrupa");
  });
});

describe("köprü geçişi", () => {
  it("Avrupa yakasına dokunan her sipariş 1 geçiş", () => {
    expect(countBridgeCrossings("anadolu", "anadolu")).toBe(0);
    expect(countBridgeCrossings("anadolu", "avrupa")).toBe(1);
    expect(countBridgeCrossings("avrupa", "anadolu")).toBe(1);
    expect(countBridgeCrossings("avrupa", "avrupa")).toBe(1);
  });
});
