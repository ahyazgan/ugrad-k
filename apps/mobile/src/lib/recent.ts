// Recent addresses derived from the customer's past orders ("Son adresler").
// Pure helpers: no API calls here, so they can be unit tested.
import { resolveSide, sideFromDistrict, type IstanbulSide } from "@yazgan/shared";
import type { DraftPoint, OrderSummary } from "./api/types";

export interface RecentPlace extends DraftPoint {
  district: string | null;
  side: IstanbulSide;
  /** Short chip label, e.g. "Beşiktaş · Levent Mah." */
  label: string;
}

/** "Levent Mah., Büyükdere Cad., Beşiktaş/İstanbul" → "Beşiktaş" (only known Istanbul districts) */
export function districtFromAddress(address: string): string | null {
  const m = address.match(/([^,/]+)\/\s*İstanbul\s*$/i);
  const name = m?.[1]?.trim();
  return name && sideFromDistrict(name) ? name : null;
}

/** First address segment, trimmed for chips ("Kılıçlı Mah. Şile Cad. No: 8A" → "Kılıçlı Mah.") */
function shortStreet(address: string): string {
  const first = address.split(",")[0]?.trim() ?? address;
  const words = first.split(/\s+/);
  return words.length > 2 ? words.slice(0, 2).join(" ") : first;
}

/**
 * Unique addresses from orders (newest first). Drop-off comes before pick-up for each order because
 * customers usually send to the same recipients again. Orders without coordinates are skipped.
 */
export function recentPlaces(orders: OrderSummary[], limit = 5): RecentPlace[] {
  const out: RecentPlace[] = [];
  const seen = new Set<string>();
  const sorted = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const o of sorted) {
    if (o.status === "iptal") continue;
    const candidates: [string, { lat: number; lng: number } | undefined][] = [
      [o.dropoffAddress, o.dropoffPoint],
      [o.pickupAddress, o.pickupPoint],
    ];
    for (const [address, point] of candidates) {
      const key = address.trim().toLocaleLowerCase("tr");
      if (!point || !address.trim() || seen.has(key)) continue;
      seen.add(key);
      const district = districtFromAddress(address);
      out.push({
        address,
        lat: point.lat,
        lng: point.lng,
        district,
        side: resolveSide(point, district),
        label: district ? `${district} · ${shortStreet(address)}` : shortStreet(address),
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
