import { upcomingHotspots, type DemandData, type LatLng } from "@yazgan/shared";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Muted, colors, font } from "@/components/ui";
import { api } from "@/lib/api";
import { openDirections } from "@/lib/navigation";

const TTL_MS = 30 * 60_000;
let cache: { at: number; data: DemandData } | null = null;
const cached = () => (cache && Date.now() - cache.at < TTL_MS ? cache.data : null);

/**
 * Boşta bekleyen kurye için: geçmiş siparişlere göre bu ve sonraki saatin yoğun bölgeleri (~1 km hücre).
 * Veri yarım saat önbellekte; hata olursa kart gizlenir (iş akışını etkilemez).
 */
export function BusyAreas({ me }: { me: LatLng | null }) {
  const [data, setData] = useState<DemandData | null>(cached);

  useEffect(() => {
    if (cached()) return;
    let alive = true;
    api.demandStats().then(
      (d) => {
        cache = { at: Date.now(), data: d };
        if (alive) setData(d);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return null;
  const spots = upcomingHotspots(data, new Date(), { from: me ?? undefined });
  if (!spots.length) return null;
  return (
    <Card style={{ gap: 8 }}>
      <Text style={{ ...font("extrabold"), color: colors.text }}>Yoğun bölgeler (önümüzdeki saat)</Text>
      {spots.map((h, i) => (
        <View
          key={`${h.lat}-${h.lng}`}
          testID="busy-area"
          style={{ flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, paddingTop: i ? 8 : 0 }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ ...font("bold"), color: colors.text }}>
              {i + 1}. {h.district ?? "Bölge"}
              {h.distanceKm != null ? ` · ${h.distanceKm.toLocaleString("tr-TR")} km` : ""}
            </Text>
            <Muted>Bu saatlerde haftada ort. {h.perWeek.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sipariş</Muted>
          </View>
          <View style={{ minWidth: 104 }}>
            <Button title="Yol tarifi" variant="secondary" onPress={() => openDirections(h.lat, h.lng, h.district ?? "Yoğun bölge")} />
          </View>
        </View>
      ))}
      <Muted>Geçmiş siparişlere dayanır; iş garantisi değildir. Otomatik atama size en yakın işi verir.</Muted>
    </Card>
  );
}
