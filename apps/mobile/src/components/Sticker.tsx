// TODO(neo-stickers): Neo tasarımındaki 3B çıkartma görselleri (kutu, moto, saat, ok, belge…) henüz depoda yok.
// Görseller eklendiğinde apps/mobile/assets/neo/<ad>.png olarak koyun ve aşağıdaki SOURCES eşlemesini doldurun:
//   const SOURCES: Partial<Record<StickerName, ImageSourcePropType>> = { box: require("../../assets/neo/box.png"), ... };
// O zamana kadar bileşen hiçbir şey çizmez; yerleşim bozulmaz.
import type { ImageSourcePropType, StyleProp, ImageStyle } from "react-native";
import { Image } from "react-native";

export type StickerName = "box" | "scooter" | "clock" | "arrow" | "document" | "roundtrip" | "pin";

const SOURCES: Partial<Record<StickerName, ImageSourcePropType>> = {};

/** Süs amaçlı 3B çıkartma; görsel yoksa boş döner. */
export function Sticker({ name, size = 80, style }: { name: StickerName; size?: number; style?: StyleProp<ImageStyle> }) {
  const source = SOURCES[name];
  if (!source) return null;
  return (
    <Image
      source={source}
      accessible={false}
      style={[{ width: size, height: size, resizeMode: "contain" }, style]}
    />
  );
}
