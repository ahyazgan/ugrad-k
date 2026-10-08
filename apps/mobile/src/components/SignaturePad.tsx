import { useEffect, useMemo, useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "./ui";

const stroke = { stroke: "#111", strokeWidth: 2.5, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

function toSvg(paths: string[], w: number, h: number) {
  const W = Math.round(w);
  const H = Math.round(h);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="100%" height="100%" fill="#fff"/>` +
    paths.map((d) => `<path d="${d}" stroke="#111" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join("") +
    `</svg>`
  );
}

const pt = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;

/** Parmakla imza. Sonuç, sunucuya yüklenecek bağımsız bir SVG metni olarak döner. */
export function SignaturePad({ onChange, height = 180 }: { onChange: (svg: string | null) => void; height?: number }) {
  // Son eleman çizilmekte olan çizgi olabilir (drawing=true iken)
  const [strokes, setStrokes] = useState<string[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [width, setWidth] = useState(300);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          setDrawing(true);
          setStrokes((s) => [...s, `M${pt(e.nativeEvent.locationX, e.nativeEvent.locationY)}`]);
        },
        onPanResponderMove: (e) => {
          const seg = ` L${pt(e.nativeEvent.locationX, e.nativeEvent.locationY)}`;
          setStrokes((s) => (s.length ? [...s.slice(0, -1), s[s.length - 1] + seg] : s));
        },
        onPanResponderRelease: () => {
          // Tek dokunuş (çizgisiz) kayıt edilmez
          setStrokes((s) => s.filter((d) => d.includes("L")));
          setDrawing(false);
        },
      }),
    [],
  );

  // Çizim bitince imzayı üst bileşene bildir
  useEffect(() => {
    if (!drawing) onChange(strokes.length ? toSvg(strokes, width, height) : null);
    // onChange her render'da yeni olabilir; yalnızca çizim değişince bildir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, drawing, width, height]);

  return (
    <View style={{ gap: 6 }}>
      <View
        testID="signature-pad"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: "#fff", overflow: "hidden" }}
        {...responder.panHandlers}
      >
        <Svg width="100%" height="100%">
          {strokes.map((d, i) => (
            <Path key={i} d={d} {...stroke} />
          ))}
        </Svg>
        {!strokes.length ? (
          <Text pointerEvents="none" style={{ position: "absolute", alignSelf: "center", top: height / 2 - 10, color: colors.muted }}>
            Alıcı buraya imza atsın
          </Text>
        ) : null}
      </View>
      <Pressable onPress={() => setStrokes([])}>
        <Text style={{ color: colors.primary, textAlign: "right" }}>Temizle</Text>
      </Pressable>
    </View>
  );
}
