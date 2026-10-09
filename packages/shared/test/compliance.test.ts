import { describe, expect, it } from "vitest";
import { blockingSummary, courierCompliance, istanbulDay, type CourierDocument } from "../compliance.ts";

const NOW = new Date("2026-10-08T21:30:00Z"); // İstanbul'da 9 Ekim 00:30
const full = (over: Partial<Record<string, string | null>> = {}): CourierDocument[] => [
  { kind: "ehliyet", expiresAt: over.ehliyet ?? "2030-01-01" },
  { kind: "kurye_faaliyet_belgesi", expiresAt: over.kfb ?? "2027-05-15" },
  { kind: "ruhsat", expiresAt: null },
  { kind: "trafik_sigortasi", expiresAt: over.sigorta ?? "2027-03-01" },
];

describe("courierCompliance", () => {
  it("zorunlu belgeler tamsa uygun", () => {
    const c = courierCompliance(full(), NOW);
    expect(c.ok).toBe(true);
    expect(c.blocking).toEqual([]);
    expect(c.items.find((i) => i.kind === "src")?.state).toBe("eksik"); // zorunlu değil
  });

  it("eksik ve süresi dolan zorunlu belge engeller; İstanbul günü esas", () => {
    expect(istanbulDay(NOW)).toBe("2026-10-09");
    const c = courierCompliance(
      full({ sigorta: "2026-10-08" }).filter((d) => d.kind !== "kurye_faaliyet_belgesi"),
      NOW,
    );
    expect(c.ok).toBe(false);
    expect(c.blocking.map((i) => i.kind)).toEqual(["kurye_faaliyet_belgesi", "trafik_sigortasi"]);
    expect(blockingSummary(c)).toBe("Kurye faaliyet belgesi (eksik), Zorunlu trafik sigortası (süresi dolmuş)");
  });

  it("bitiş günü dahil geçerli; 30 gün içinde uyarı", () => {
    const c = courierCompliance(full({ sigorta: "2026-10-09", ehliyet: "2026-11-08" }), NOW);
    expect(c.ok).toBe(true);
    const s = c.items.find((i) => i.kind === "trafik_sigortasi")!;
    expect([s.state, s.daysLeft]).toEqual(["yaklasiyor", 0]);
    expect(c.items.find((i) => i.kind === "ehliyet")!.state).toBe("yaklasiyor");
    expect(c.warnings.map((w) => w.kind)).toEqual(["ehliyet", "trafik_sigortasi"]);
    expect(courierCompliance(full({ ehliyet: "2026-11-09" }), NOW).items[0]!.state).toBe("gecerli");
  });
});
