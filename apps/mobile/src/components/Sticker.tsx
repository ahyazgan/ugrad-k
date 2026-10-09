// Neo tasarımının 3B çıkartma görselleri (apps/mobile/assets/neo/*.png, saydam arka plan, en fazla 400 px genişlik).
// Görseller tamamen süs amaçlıdır: erişilebilirlik ağacından gizlenir ve dokunmaları yakalamaz.
import type { ImageSourcePropType, StyleProp, ViewStyle } from "react-native";
import { Image, View } from "react-native";

export type StickerName =
  | "motor"
  | "kask"
  | "pin"
  | "telefon"
  | "ev"
  | "bina"
  | "kamera"
  | "imza"
  | "fis"
  | "hediye"
  | "kart"
  | "yildiz"
  | "zarf"
  | "kutu"
  | "simsek"
  | "kronometre"
  | "donus"
  | "cuzdan"
  | "vardiya"
  | "mesaj"
  | "kilit"
  | "harita"
  | "kopru";

/** Statik require eşlemesi (Metro paketleyicisi dinamik yol çözemez). `ratio` = yükseklik / genişlik. */
const STICKERS: Record<StickerName, { source: ImageSourcePropType; ratio: number }> = {
  motor: { source: require("../../assets/neo/motor.png"), ratio: 325 / 335 },
  kask: { source: require("../../assets/neo/kask.png"), ratio: 307 / 307 },
  pin: { source: require("../../assets/neo/pin.png"), ratio: 317 / 249 },
  telefon: { source: require("../../assets/neo/telefon.png"), ratio: 326 / 279 },
  ev: { source: require("../../assets/neo/ev.png"), ratio: 300 / 320 },
  bina: { source: require("../../assets/neo/bina.png"), ratio: 306 / 255 },
  kamera: { source: require("../../assets/neo/kamera.png"), ratio: 280 / 325 },
  imza: { source: require("../../assets/neo/imza.png"), ratio: 301 / 324 },
  fis: { source: require("../../assets/neo/fis.png"), ratio: 322 / 285 },
  hediye: { source: require("../../assets/neo/hediye.png"), ratio: 320 / 304 },
  kart: { source: require("../../assets/neo/kart.png"), ratio: 285 / 348 },
  yildiz: { source: require("../../assets/neo/yildiz.png"), ratio: 302 / 301 },
  zarf: { source: require("../../assets/neo/zarf.png"), ratio: 201 / 222 },
  kutu: { source: require("../../assets/neo/kutu.png"), ratio: 273 / 327 },
  simsek: { source: require("../../assets/neo/simsek.png"), ratio: 226 / 157 },
  kronometre: { source: require("../../assets/neo/kronometre.png"), ratio: 141 / 112 },
  donus: { source: require("../../assets/neo/donus.png"), ratio: 172 / 129 },
  // docs/gorsel-istemleri.md §2 (only the ones used in the app are bundled)
  cuzdan: { source: require("../../assets/neo/cuzdan.png"), ratio: 400 / 372 },
  vardiya: { source: require("../../assets/neo/vardiya.png"), ratio: 315 / 400 },
  mesaj: { source: require("../../assets/neo/mesaj.png"), ratio: 340 / 400 },
  kilit: { source: require("../../assets/neo/kilit.png"), ratio: 400 / 295 },
  harita: { source: require("../../assets/neo/harita.png"), ratio: 297 / 400 },
  kopru: { source: require("../../assets/neo/kopru.png"), ratio: 352 / 400 },
};

export type StickerProps = {
  name: StickerName;
  /** Genişlik (px); yükseklik görselin oranından hesaplanır. */
  size?: number;
  /** Derece cinsinden döndürme (ör. -8). */
  rotation?: number;
  /** Konumlandırma/kenar boşlukları (ör. position: "absolute"); sarmalayıcı görünüme uygulanır. */
  style?: StyleProp<ViewStyle>;
};

/** Süs amaçlı 3B çıkartma; dokunmaları altındaki öğeye bırakır. */
export function Sticker({ name, size = 80, rotation = 0, style }: StickerProps) {
  const { source, ratio } = STICKERS[name];
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ pointerEvents: "none" }, rotation ? { transform: [{ rotate: `${rotation}deg` }] } : null, style]}
    >
      <Image
        source={source}
        accessible={false}
        resizeMode="contain"
        style={{ width: size, height: Math.round(size * ratio) }}
      />
    </View>
  );
}
