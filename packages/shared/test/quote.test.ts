import { describe, expect, it, vi } from "vitest";
import { MOCK_PLACES, googleMapsProvider, mockMapsProvider } from "../maps.ts";
import { DEFAULT_PRICING_SETTINGS } from "../pricing.ts";
import { ValidationError, buildQuote, orderRowFromQuote, parseOrderRequest } from "../quote.ts";

const NOW = new Date("2026-10-07T11:00:00Z"); // 14:00 İstanbul
const place = (id: string) => MOCK_PLACES.find((p) => p.placeId === id)!;
const body = (extra: Record<string, unknown> = {}) => ({
  pickup: { ...place("mock-beykoz"), contactPhone: "+90 532 000 00 00" },
  dropoff: place("mock-kadikoy"),
  ...extra,
});

describe("parseOrderRequest", () => {
  it("geçerli isteği varsayılanlarla doldurur", () => {
    const r = parseOrderRequest(body(), NOW);
    expect(r.urgent).toBe(false);
    expect(r.paymentMethod).toBe("kart");
    expect(r.scheduledPickupAt).toBeNull();
    expect(r.pickup.district).toBe("Beykoz");
  });

  it.each([
    [{ pickup: undefined }, "pickup"],
    [{ dropoff: { address: "x", lat: 0, lng: 0 } }, "dropoff"],
    [{ dropoff: { address: "", lat: 41, lng: 29 } }, "dropoff.address"],
    [{ weightKg: -1 }, "weightKg"],
    [{ weightKg: "abc" }, "weightKg"],
    [{ scheduledPickupAt: "2026-10-06T10:00:00Z" }, "scheduledPickupAt"],
    [{ scheduledPickupAt: "2027-01-01T10:00:00Z" }, "scheduledPickupAt"],
    [{ paymentMethod: "kripto" }, "paymentMethod"],
    [{ pickup: { ...place("mock-beykoz"), contactPhone: "123" } }, "pickup.contactPhone"],
  ])("hatalı alan %#", (extra, field) => {
    try {
      parseOrderRequest(body(extra as Record<string, unknown>), NOW);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).field).toBe(field);
    }
  });
});

describe("buildQuote", () => {
  const deps = { maps: mockMapsProvider(), settings: DEFAULT_PRICING_SETTINGS, holidays: [], now: NOW };

  it("Anadolu içi: köprü yok, fiyat pricing.ts ile aynı", async () => {
    const q = await buildQuote(parseOrderRequest(body(), NOW), deps);
    expect(q.bridgeCrossings).toBe(0);
    expect(q.pickupSide).toBe("anadolu");
    expect(q.quote.meta.distanceKm).toBe(Math.ceil(q.distanceMeters / 1000));
  });

  it("Avrupa'ya geçiş köprü ücreti ekler", async () => {
    const q = await buildQuote(parseOrderRequest(body({ dropoff: place("mock-levent") }), NOW), {
      ...deps,
      settings: { ...DEFAULT_PRICING_SETTINGS, bridgeFeeKurus: 6_000 },
    });
    expect(q.dropoffSide).toBe("avrupa");
    expect(q.quote.lines.find((l) => l.code === "bridge")?.amountKurus).toBe(6_000);
  });

  it("gidiş-dönüşte dönüş rotası ayrıca sorgulanır", async () => {
    const maps = mockMapsProvider();
    const spy = vi.spyOn(maps, "route");
    const q = await buildQuote(parseOrderRequest(body({ roundTrip: true }), NOW), { ...deps, maps });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(q.returnDistanceMeters).not.toBeNull();
  });

  it("planlı gece alışı gece ücretine tabidir", async () => {
    const q = await buildQuote(
      parseOrderRequest(body({ scheduledPickupAt: "2026-10-07T20:30:00Z" }), NOW), // 23:30
      deps,
    );
    expect(q.quote.meta.nightOrHoliday).toBe(true);
  });

  it("sipariş satırı fiyatı teklif ile birebir taşır", async () => {
    const req = parseOrderRequest(body({ urgent: true, weightKg: 12 }), NOW);
    const q = await buildQuote(req, deps);
    const row = orderRowFromQuote(req, q);
    expect(row.total_kurus).toBe(q.quote.totalKurus);
    expect(row.price_quote).toBe(q.quote);
    expect(row.pickup_contact_phone).toBe("+90 532 000 00 00");
  });
});

describe("googleMapsProvider", () => {
  const ok = (json: unknown) => Promise.resolve(new Response(JSON.stringify(json), { status: 200 }));

  it("Routes API cevabını çözer ve anahtarı başlıkta gönderir", async () => {
    const fetchFn = vi.fn(() => ok({ routes: [{ distanceMeters: 12_345, duration: "1500s" }] }));
    const maps = googleMapsProvider("KEY", fetchFn as unknown as typeof fetch);
    const r = await maps.route({ lat: 41, lng: 29 }, { lat: 41.1, lng: 29.1 });
    expect(r).toEqual({ distanceMeters: 12_345, durationSeconds: 1500 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("routes.googleapis.com");
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("KEY");
  });

  it("place details ilçeden yaka çıkarır", async () => {
    const fetchFn = vi.fn(() =>
      ok({
        id: "abc",
        formattedAddress: "Levent, Beşiktaş/İstanbul",
        location: { latitude: 41.08, longitude: 29.01 },
        addressComponents: [{ longText: "Beşiktaş", types: ["administrative_area_level_2", "political"] }],
      }),
    );
    const d = await googleMapsProvider("KEY", fetchFn as unknown as typeof fetch).placeDetails("abc");
    expect(d).toMatchObject({ district: "Beşiktaş", side: "avrupa", lat: 41.08 });
  });

  it("autocomplete önerilerini düzleştirir", async () => {
    const fetchFn = vi.fn(() =>
      ok({
        suggestions: [
          { placePrediction: { placeId: "p1", structuredFormat: { mainText: { text: "Kanyon" }, secondaryText: { text: "Levent" } } } },
          { queryPrediction: {} },
        ],
      }),
    );
    const s = await googleMapsProvider("KEY", fetchFn as unknown as typeof fetch).autocomplete("kanyon");
    expect(s).toEqual([{ placeId: "p1", title: "Kanyon", subtitle: "Levent" }]);
  });

  it("HTTP hatasını anlamlı mesajla iletir", async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response("denied", { status: 403 })));
    await expect(
      googleMapsProvider("KEY", fetchFn as unknown as typeof fetch).route({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }),
    ).rejects.toThrow(/403/);
  });
});
