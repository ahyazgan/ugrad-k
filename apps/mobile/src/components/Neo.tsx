// Neo tasarım dilinin markaya özgü parçaları: logo yazısı, el yazısı etiketler, büyük başlık, siyah hap çubuğu.
import Ionicons from "@expo/vector-icons/Ionicons";
import { BRAND } from "@yazgan/shared";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Sticker, type StickerName } from "./Sticker";
import { colors, font, radii, shadow, type } from "./theme";
import { Button } from "./ui";

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
  loading,
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
  loading?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? action}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={onPress}
      disabled={off}
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
        opacity: off ? 0.55 : pressed ? 0.9 : 1,
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
        {loading ? <ActivityIndicator color={colors.ink} /> : <Ionicons name="arrow-forward" size={18} color={colors.ink} />}
      </View>
    </Pressable>
  );
}

/** Rota kartı: siyah daire (alış) → kesikli çizgi → limon kare (teslim) */
export function RouteCard({ from, to, footer }: { from: ReactNode; to: ReactNode; footer?: ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, paddingVertical: 12, gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ alignItems: "center", paddingVertical: 18 }}>
          <View style={{ width: 12, height: 12, borderRadius: 99, backgroundColor: colors.ink }} />
          <View style={{ flex: 1, width: 0, borderLeftWidth: 2, borderStyle: "dashed", borderColor: colors.ink, marginVertical: 4 }} />
          <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: colors.limeDot }} />
        </View>
        <View style={{ flex: 1 }}>
          {from}
          <View style={{ height: 1, backgroundColor: colors.bg }} />
          {to}
        </View>
      </View>
      {footer}
    </View>
  );
}

/** Rota kartındaki tek satır (etiket + adres) */
export function RouteStop({ label, address, details }: { label: string; address: string; details?: string | null }) {
  return (
    <View style={{ paddingVertical: 8, gap: 2 }}>
      <Text style={type.label}>{label}</Text>
      <Text style={{ ...font("bold"), fontSize: 15, color: colors.ink }}>{address}</Text>
      {details ? <Text style={{ ...font("semibold"), fontSize: 13, color: colors.muted }}>{details}</Text> : null}
    </View>
  );
}

export type EmptyAction = {
  label: string;
  onPress: () => void;
  testID?: string;
  /** Ekranda başka limon ana eylem varsa "dark" veya "secondary" seçin (ekran başına ≤1 limon) */
  variant?: "primary" | "dark" | "secondary";
};

/**
 * Boş durum: çıkartma (88–104 px, ±8°) + kısa başlık (≤5 kelime) + tek satır açıklama + tek eylem.
 * Tek satırlık soluk "henüz yok" metinlerinin yerine kullanılır.
 */
export function EmptyState({
  sticker,
  stickerSize = 96,
  rotation = -6,
  title,
  body,
  action,
  surface = true,
  testID,
  children,
}: {
  sticker: StickerName;
  stickerSize?: number;
  rotation?: number;
  title: string;
  body?: string;
  action?: EmptyAction;
  /** Beyaz kart zemini (bir kartın içindeyse false) */
  surface?: boolean;
  testID?: string;
  /** Eylemin yerine/altında özel içerik (ör. hazır cevap çipleri) */
  children?: ReactNode;
}) {
  const size = Math.max(88, Math.min(104, stickerSize));
  const turn = Math.max(-8, Math.min(8, rotation));
  return (
    <View
      testID={testID}
      style={[
        { alignItems: "center", gap: 8, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 20 },
        surface ? { backgroundColor: colors.surface, borderRadius: radii.card } : null,
      ]}
    >
      <Sticker name={sticker} size={size} rotation={turn} style={{ marginBottom: 4 }} />
      <Text accessibilityRole="header" style={{ ...type.h2, textAlign: "center" }}>
        {title}
      </Text>
      {body ? (
        <Text style={{ ...font("semibold"), fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: "center", maxWidth: 320 }}>{body}</Text>
      ) : null}
      {action ? (
        <View style={{ alignSelf: "center", minWidth: 220, marginTop: 8 }}>
          <Button title={action.label} onPress={action.onPress} testID={action.testID} variant={action.variant ?? "primary"} />
        </View>
      ) : null}
      {children}
    </View>
  );
}
