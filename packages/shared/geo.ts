/** İstanbul yaka tespiti ve köprü geçişi. */

export type IstanbulSide = "anadolu" | "avrupa";

export interface LatLng {
  lat: number;
  lng: number;
}

const normalize = (s: string) =>
  s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");

const ANADOLU = [
  "Adalar", "Ataşehir", "Beykoz", "Çekmeköy", "Kadıköy", "Kartal", "Maltepe",
  "Pendik", "Sancaktepe", "Sultanbeyli", "Şile", "Tuzla", "Ümraniye", "Üsküdar",
];
const AVRUPA = [
  "Arnavutköy", "Avcılar", "Bağcılar", "Bahçelievler", "Bakırköy", "Başakşehir",
  "Bayrampaşa", "Beşiktaş", "Beylikdüzü", "Beyoğlu", "Büyükçekmece", "Çatalca",
  "Esenler", "Esenyurt", "Eyüpsultan", "Eyüp", "Fatih", "Gaziosmanpaşa", "Güngören",
  "Kağıthane", "Küçükçekmece", "Sarıyer", "Silivri", "Sultangazi", "Şişli", "Zeytinburnu",
];

const DISTRICT_SIDE = new Map<string, IstanbulSide>([
  ...ANADOLU.map((d) => [normalize(d), "anadolu"] as const),
  ...AVRUPA.map((d) => [normalize(d), "avrupa"] as const),
]);

/** İlçe adından yaka (İstanbul dışı veya bilinmeyen ilçe → null). */
export function sideFromDistrict(district: string | null | undefined): IstanbulSide | null {
  if (!district) return null;
  return DISTRICT_SIDE.get(normalize(district)) ?? null;
}

// Boğaz orta hattı (güneyden kuzeye) — ilçe bilinmediğinde yaklaşık tespit için.
const BOSPHORUS: ReadonlyArray<readonly [lat: number, lng: number]> = [
  [40.9, 28.995],
  [41.01, 28.995],
  [41.03, 29.012],
  [41.045, 29.035],
  [41.07, 29.05],
  [41.084, 29.061],
  [41.1, 29.06],
  [41.14, 29.072],
  [41.17, 29.075],
  [41.2, 29.1],
  [41.23, 29.13],
  [41.4, 29.13],
];

/** Koordinattan yaka: boğaz hattının doğusu Anadolu. */
export function sideFromLatLng({ lat, lng }: LatLng): IstanbulSide {
  const pts = BOSPHORUS;
  let lineLng = pts[0]![1];
  if (lat >= pts[pts.length - 1]![0]) lineLng = pts[pts.length - 1]![1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [lat1, lng1] = pts[i]!;
    const [lat2, lng2] = pts[i + 1]!;
    if (lat >= lat1 && lat <= lat2) {
      lineLng = lng1 + ((lat - lat1) / (lat2 - lat1)) * (lng2 - lng1);
      break;
    }
  }
  return lng > lineLng ? "anadolu" : "avrupa";
}

export function resolveSide(point: LatLng, district?: string | null): IstanbulSide {
  return sideFromDistrict(district) ?? sideFromLatLng(point);
}

/**
 * Ücretlendirilecek köprü geçişi sayısı.
 * Merkez Anadolu yakasında (Beykoz) olduğu için alış veya teslim noktalarından
 * biri Avrupa yakasındaysa kurye en az bir kez ücretli geçiş yapar → 1 geçiş.
 * Geçiş başına tutar panelden (`bridge_fee_kurus`) ayarlanır.
 */
export function countBridgeCrossings(pickup: IstanbulSide, dropoff: IstanbulSide): number {
  return pickup === "avrupa" || dropoff === "avrupa" ? 1 : 0;
}

/** Kuş uçuşu mesafe (metre). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
