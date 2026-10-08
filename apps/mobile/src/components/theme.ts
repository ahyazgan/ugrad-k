// "Neo" tasarım dili — mobil uygulamanın tüm renk, köşe ve yazı tipi belirteçleri.
// Renklerin kaynağı packages/shared/brand.ts (BRAND.neo); ekranlar bu dosyadan okur.
import { BRAND } from "@yazgan/shared";
import type { TextStyle } from "react-native";

const neo = BRAND.neo;

export const colors = {
  // Neo belirteçleri
  bg: neo.bg,
  lime: neo.lime,
  limeDot: neo.limeDot,
  ink: neo.ink,
  surface: neo.surface,
  inactive: neo.inactive,
  mutedDark: neo.mutedDark,
  onInkMuted: neo.onInkMuted,
  // Anlamsal adlar (ekranlar bunları kullanır)
  primary: neo.ink,
  /** Seçili / vurgulu açık zemin (lila üzerinde de okunur) */
  primaryLight: "#DCD2FB",
  /** Vurgu: yalnız zemin rengi olarak kullanın (açık zeminde limon yazı yok) */
  accent: neo.lime,
  text: neo.ink,
  muted: neo.muted,
  border: "#DDD6F5",
  card: neo.surface,
  /** Yıldız puanı: limon beyaz zeminde okunmaz, sıcak sarı kalır */
  star: "#F5A70B",
  danger: "#C0262D",
  dangerLight: "#FDE4E4",
  success: "#1F5C08",
  successLight: neo.lime,
  /** Uyarı (amber): yaklaşan süre, çevrimdışı kuyruk, mola */
  warn: "#92400E",
  warnLight: "#FEF3C7",
  /** İade / geri dönüş (turuncu) */
  returnTone: "#9A3412",
  returnLight: "#FFEDD5",
  /** Harita karoları yüklenene kadar zemin */
  mapBg: "#E8ECEF",
  /** Pasif ana düğme zemini (okunur kalır, limon gibi "basılabilir" görünmez) */
  disabledBg: "#D9D3F0",
  /** Siyah çubuk üzerindeki pasif hap */
  inkRaised: "#2E2D38",
};

export const radii = {
  pill: 999,
  card: 26,
  tile: 22,
  field: 18,
  small: 12,
};

/**
 * Yazı tipleri: Archivo (başlık 900, gövde 500–800) ve Caveat Brush (el yazısı etiketler).
 * React Native'de özel yazı tiplerinde her ağırlık ayrı bir ailedir; fontWeight yerine bunları kullanın.
 * Kök düzen (app/_layout.tsx) yüklenene kadar bekler; yüklenemezse sistem yazı tipi kullanılır.
 */
export const fontFamilies = {
  medium: "Archivo_500Medium",
  semibold: "Archivo_600SemiBold",
  bold: "Archivo_700Bold",
  extrabold: "Archivo_800ExtraBold",
  black: "Archivo_900Black",
  hand: "CaveatBrush_400Regular",
} as const;

export type FontWeightName = keyof typeof fontFamilies;

/** Bir ağırlık için yazı tipi stili. (Özel ailelerle fontWeight verilmez; Android/web sahte kalınlaştırır.) */
export function font(weight: FontWeightName): TextStyle {
  return { fontFamily: fontFamilies[weight] };
}

/** Başlık ölçekleri (dar, negatif harf aralığı) */
export const type = {
  hero: { ...font("black"), fontSize: 64, lineHeight: 60, letterSpacing: -3.5, color: colors.ink } as TextStyle,
  h1: { ...font("black"), fontSize: 44, lineHeight: 42, letterSpacing: -2, color: colors.ink } as TextStyle,
  h2: { ...font("black"), fontSize: 24, lineHeight: 26, letterSpacing: -0.8, color: colors.ink } as TextStyle,
  h3: { ...font("black"), fontSize: 18, lineHeight: 22, letterSpacing: -0.4, color: colors.ink } as TextStyle,
  body: { ...font("semibold"), fontSize: 15, lineHeight: 21, color: colors.ink } as TextStyle,
  label: { ...font("extrabold"), fontSize: 11, letterSpacing: 1, color: colors.muted } as TextStyle,
};

/** Hafif, mor tonlu gölge (kartlar ve yüzen sekme çubuğu) */
export const shadow = {
  shadowColor: "#111114",
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};
