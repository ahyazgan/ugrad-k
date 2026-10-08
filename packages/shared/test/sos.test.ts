import { describe, expect, it } from "vitest";
import { isIncidentKind, sosAlertText } from "../sos.ts";

describe("acil durum", () => {
  it("alarm metni: kurye, tür, not, harita bağlantısı, iş", () => {
    expect(
      sosAlertText({
        kind: "kaza",
        courierName: "Mehmet Kaya",
        courierPhone: "+905551110001",
        lat: 41.123456,
        lng: 29.0987654,
        accuracyM: 8.4,
        note: "Yokuşta düştüm",
        orderNo: "YK-1042",
      }),
    ).toBe(
      "🚨 ACİL DURUM: Mehmet Kaya +905551110001 — Kaza. Not: Yokuşta düştüm. Konum: https://maps.google.com/?q=41.12346,29.09877 (±8 m). Elindeki iş: YK-1042. Panelde 'Gördüm' deyin.",
    );
  });

  it("konumsuz ve yeniden uyarı", () => {
    const t = sosAlertText({ kind: "arac_ariza", courierName: null, courierPhone: null, lat: null, lng: null, repeat: 2 });
    expect(t).toBe("🚨 ACİL DURUM (2. uyarı, henüz görülmedi): Kurye — Araç arızası. Konum alınamadı. Panelde 'Gördüm' deyin.");
  });

  it("tür doğrulama", () => {
    expect(isIncidentKind("saglik")).toBe(true);
    expect(isIncidentKind("yangin")).toBe(false);
    expect(isIncidentKind("toString")).toBe(false);
  });
});
