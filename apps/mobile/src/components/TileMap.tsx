import {
  DEFAULT_TILE_ATTRIBUTION,
  DEFAULT_TILE_URL,
  fitView,
  toScreen,
  visibleTiles,
  type LatLng,
} from "@yazgan/shared";
import { useState } from "react";
import { Image, Platform, Text, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import { colors } from "@/components/ui";

const TILE_URL = process.env.EXPO_PUBLIC_MAP_TILE_URL || DEFAULT_TILE_URL;
const ATTRIBUTION = process.env.EXPO_PUBLIC_MAP_TILE_ATTRIBUTION || DEFAULT_TILE_ATTRIBUTION;
// OSM karo politikası uygulamanın kendini tanıtmasını ister (tarayıcı bunu kendisi yapar)
const TILE_HEADERS = Platform.OS === "web" ? undefined : { "User-Agent": "YazganKurye/1.0 (+https://yazgankurye.com)" };

export interface MapMarker extends LatLng {
  kind: "pickup" | "dropoff" | "courier";
}

const MARKER: Record<MapMarker["kind"], { bg: string; label: string; size: number }> = {
  pickup: { bg: colors.primary, label: "A", size: 26 },
  dropoff: { bg: colors.success, label: "T", size: 26 },
  courier: { bg: colors.accent, label: "🛵", size: 34 },
};

/**
 * Hafif, etkileşimsiz harita: işaretlerin hepsini sığdıran OSM karoları + işaretler.
 * Yerel harita modülü veya API anahtarı gerektirmez; iOS, Android ve web'de aynı çalışır.
 */
export function TileMap({ markers, height = 220, route = true }: { markers: MapMarker[]; height?: number; route?: boolean }) {
  const [width, setWidth] = useState(0);
  const view = width ? fitView(markers, width, height, { padding: 36 }) : null;
  const pickup = markers.find((m) => m.kind === "pickup");
  const dropoff = markers.find((m) => m.kind === "dropoff");
  const a = view && pickup ? toScreen(pickup, view) : null;
  const b = view && dropoff ? toScreen(dropoff, view) : null;

  return (
    <View
      testID="tile-map"
      accessibilityLabel="Harita"
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={{ height, borderRadius: 12, overflow: "hidden", backgroundColor: "#E8ECEF" }}
    >
      {view
        ? visibleTiles(view, TILE_URL).map((t) => (
            <Image
              key={t.key}
              source={{ uri: t.url, headers: TILE_HEADERS }}
              style={{ position: "absolute", left: t.left, top: t.top, width: 256, height: 256 }}
            />
          ))
        : null}
      {route && a && b ? (
        <Svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
          <Line x1={a.left} y1={a.top} x2={b.left} y2={b.top} stroke={colors.primary} strokeWidth={3} strokeDasharray="6 6" strokeOpacity={0.7} />
        </Svg>
      ) : null}
      {view
        ? // Kurye altta: alış/teslim harfleri üstüne binince de okunur
          [...markers].sort((x, y) => Number(y.kind === "courier") - Number(x.kind === "courier")).map((m, i) => {
            const s = toScreen(m, view);
            const spec = MARKER[m.kind];
            return (
              <View
                key={i}
                testID={`marker-${m.kind}`}
                style={{
                  position: "absolute",
                  left: s.left - spec.size / 2,
                  top: s.top - spec.size / 2,
                  width: spec.size,
                  height: spec.size,
                  borderRadius: spec.size / 2,
                  backgroundColor: spec.bg,
                  borderWidth: 2,
                  borderColor: "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: m.kind === "courier" ? 16 : 12 }}>{spec.label}</Text>
              </View>
            );
          })
        : null}
      <Text
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          fontSize: 10,
          color: colors.muted,
          backgroundColor: "rgba(255,255,255,0.85)",
          paddingHorizontal: 4,
        }}
      >
        {ATTRIBUTION}
      </Text>
    </View>
  );
}
