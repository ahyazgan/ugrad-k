// Neo tasarım dilinin markaya özgü parçaları: logo yazısı, el yazısı etiketler, büyük başlık, siyah hap çubuğu.
import Ionicons from "@expo/vector-icons/Ionicons";
import { BRAND } from "@yazgan/shared";
import type { ReactNode } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors, font, radii, shadow, type } from "./theme";

/** Marka yazısı + limon ok + slogan. Ad BRAND'den gelir (marka adı kodda sabit yazılmaz). */
export function Wordmark({ size = 46, tagline = true }: { size?: number; tagline?: boolean }) {
  const k = size / 46;
  return (
    <View accessibilityRole="header" accessibilityLabel={BRAND.name}>
      <View>
        <Text style={{ ...font("black"), fontSize: size, lineHeight: size * 1.02, letterSpacing: -2 * k, color: colors.ink }}>
          {BRAND.shortName.toLocaleUpperCase("tr")}
        </Text>
        <Svg
          width={40 * k}
          height={22 * k}
          viewBox="0 0 40 22"
          style={{ position: "absolute", left: 22 * k, top: 14 * k }}
          pointerEvents="none"
        >
          <Path d="M2 16 L26 9" stroke={colors.lime} strokeWidth={7} strokeLinecap="round" />
          <Path d="M20 3 L34 7 L25 18" fill="none" stroke={colors.lime} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      {tagline ? (
        <Text style={{ ...font("extrabold"), fontSize: 10 * k, letterSpacing: 4.2 * k, color: colors.ink, marginTop: 4 }}>
          {BRAND.tagline.toLocaleUpperCase("tr")}
        </Text>
      ) : null}
    </View>
  );
}

/** El yazısı (Caveat Brush) "çıkartma" etiketi — süs amaçlı, ekran okuyuculardan gizli */
export function HandTag({
  children,
  tone = "lime",
  rotate = -10,
  style,
}: {
  children: ReactNode;
  tone?: "lime" | "white" | "none";
  rotate?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = tone === "lime" ? colors.lime : tone === "white" ? colors.surface : "transparent";
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          alignSelf: "flex-start",
          backgroundColor: bg,
          paddingHorizontal: tone === "none" ? 0 : 9,
          paddingTop: 4,
          paddingBottom: 2,
          borderRadius: 12,
          transform: [{ rotate: `${rotate}deg` }],
        },
        tone === "white" ? shadow : null,
        style,
      ]}
    >
      <Text style={{ ...font("hand"), fontSize: 19, lineHeight: 19, color: colors.ink }}>{children}</Text>
    </View>
  );
}

/** Ekran başlığı: dev, sıkı harf aralıklı siyah başlık */
export function BigTitle({ children, size = 58 }: { children: ReactNode; size?: number }) {
  return (
    <Text
      accessibilityRole="header"
      style={{ ...type.hero, fontSize: size, lineHeight: size * 0.94, letterSpacing: -size * 0.055 }}
    >
      {children}
    </Text>
  );
}

/** Küçük siyah hap rozet (ör. "ADIM 1 / 2") — limon yazı yalnız siyah zeminde */
export function InkChip({ children }: { children: ReactNode }) {
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
      <Text style={{ ...font("extrabold"), color: colors.lime, fontSize: 12, letterSpacing: 1.5 }}>{children}</Text>
    </View>
  );
}

/** Siyah hap çubuk + limon eylem düğmesi (ör. "Nereye gönderelim? · Gönder") */
export function InkPillBar({
  placeholder,
  title,
  caption,
  action,
  onPress,
  disabled,
  testID,
  accessibilityLabel,
}: {
  /** Soluk yer tutucu metin (arama çubuğu görünümü) */
  placeholder?: string;
  /** Büyük beyaz değer (ör. toplam tutar) */
  title?: string;
  /** Değerin üstündeki küçük açıklama */
  caption?: string;
  action: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? action}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: title ? 70 : 58,
        backgroundColor: colors.ink,
        borderRadius: radii.pill,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingLeft: placeholder ? 20 : 24,
        paddingRight: 6,
        paddingVertical: 5,
        opacity: disabled ? 0.55 : pressed ? 0.9 : 1,
      })}
    >
      {placeholder ? <Ionicons name="search" size={22} color="#fff" /> : null}
      <View style={{ flex: 1 }}>
        {caption ? <Text style={{ ...font("bold"), fontSize: 11, letterSpacing: 0.5, color: colors.onInkMuted }}>{caption}</Text> : null}
        {title ? (
          <Text style={{ ...font("black"), fontSize: 22, letterSpacing: -0.6, color: "#fff" }}>{title}</Text>
        ) : (
          <Text style={{ ...font("semibold"), fontSize: 16, color: colors.onInkMuted }} numberOfLines={1}>
            {placeholder}
          </Text>
        )}
      </View>
      <View
        style={{
          height: title ? 58 : 48,
          paddingHorizontal: title ? 22 : 18,
          borderRadius: radii.pill,
          backgroundColor: colors.lime,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text style={{ ...font("extrabold"), fontSize: 17, color: colors.ink }}>{action}</Text>
        <Ionicons name="arrow-forward" size={18} color={colors.ink} />
      </View>
    </Pressable>
  );
}
