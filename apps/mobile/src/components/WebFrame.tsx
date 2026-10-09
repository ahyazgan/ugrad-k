// Desktop web frame: on wide browser windows the whole app (stack headers, screens, floating tab bar,
// modal-presented routes, bottom bars, maps) lives in a centered phone-width column; on even wider windows
// a decorative brand panel sits to the left of it. Native and mobile-width web render children unchanged.
import Ionicons from "@expo/vector-icons/Ionicons";
import { BRAND } from "@yazgan/shared";
import { Link } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { Platform, ScrollView, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import { APP_COLUMN_MAX_WIDTH, useWebFrameMode } from "@/lib/layout";
import { useSession } from "@/lib/session";
import { InkChip, Wordmark } from "./Neo";
import { Sticker, type StickerName } from "./Sticker";
import { colors, font, radii, type } from "./theme";

/** Backdrop outside the column: a slightly deeper lilac with a faint dot grid (web-only CSS). */
const BACKDROP = {
  backgroundColor: "#E1D8FB",
  backgroundImage: "radial-gradient(rgba(17, 17, 20, 0.07) 1.2px, transparent 1.6px)",
  backgroundSize: "22px 22px",
} as unknown as ViewStyle;

/** Column edge: hairline + soft lilac shadow so the app reads as one "device" surface. */
const COLUMN_EDGE: ViewStyle = {
  borderLeftWidth: 1,
  borderRightWidth: 1,
  borderColor: "rgba(17, 17, 20, 0.06)",
  boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.5), 0 24px 64px rgba(64, 40, 140, 0.16)",
};

const PANEL_MAX_WIDTH = 440;
const PANEL_GAP = 72;

export function WebFrame({ children }: { children: ReactNode }) {
  const mode = useWebFrameMode();
  const { width } = useWindowDimensions();
  if (Platform.OS !== "web") return <>{children}</>;

  // On web the element tree stays the same in every mode (only styles change, the panel is a trailing
  // sibling), so resizing across a breakpoint never remounts the navigator and its history.
  const framed = mode !== "none";
  const panelWidth = Math.min(PANEL_MAX_WIDTH, width - APP_COLUMN_MAX_WIDTH - PANEL_GAP - 2 * 40);
  return (
    // row-reverse: the app column comes first in DOM / reading order, the brand panel is visually on its left
    <View
      style={[
        { flex: 1 },
        framed ? [{ flexDirection: "row-reverse", justifyContent: "center", alignItems: "stretch", gap: PANEL_GAP }, BACKDROP] : null,
      ]}
    >
      <View
        testID="app-column"
        role="main"
        style={
          framed
            ? [{ width: APP_COLUMN_MAX_WIDTH, maxWidth: "100%", height: "100%", overflow: "hidden", backgroundColor: colors.bg }, COLUMN_EDGE]
            : { flex: 1 }
        }
      >
        {children}
      </View>
      {mode === "panel" ? <BrandPanel width={panelWidth} /> : null}
    </View>
  );
}

type IconName = ComponentProps<typeof Ionicons>["name"];
/** Each feature is illustrated with the Neo 3D sticker that carries its meaning (same mapping as the website). */
type Feature = { sticker: StickerName; title: string; body: string };

/** Real product features only (no invented numbers or testimonials). */
const CUSTOMER = {
  kicker: "TARAYICIDAN SİPARİŞ",
  title: "Gönder.\nİzle.\nTeslim.",
  /** Pin sticker sits after the shortest title line (offsets in multiples of the title size) */
  pin: { left: 2.2, top: 0.82 },
  lead: `${BRAND.slogan}. Siparişini buradan ver, kuryeni buradan izle.`,
  features: [
    { sticker: "fis", title: "Anında fiyat", body: "Adresi gir, fiyatı hemen gör." },
    { sticker: "pin", title: "Canlı takip", body: "Kuryeni haritada izle." },
    { sticker: "kamera", title: "Teslim kanıtı", body: "Fotoğraf ve imzayla teslim." },
    { sticker: "zarf", title: "E-arşiv fatura", body: "Teslimden sonra otomatik." },
  ] as Feature[],
  links: [
    { label: "Fiyatlar", href: `${BRAND.siteUrl}/fiyatlar` },
    { label: "Kurumsal hesap", href: `${BRAND.siteUrl}/kurumsal` },
  ],
};

const COURIER = {
  kicker: "KURYE UYGULAMASI",
  title: "Al.\nGötür.\nKazan.",
  pin: { left: 1.55, top: -0.12 },
  lead: "Vardiyan, iş tekliflerin ve kazancın tek uygulamada.",
  features: [
    { sticker: "simsek", title: "İş teklifleri", body: "Kabul et ya da nedenini seç." },
    { sticker: "donus", title: "Durak sırası", body: "Alış ve teslim sırası hazır." },
    { sticker: "kamera", title: "Teslim kanıtı", body: "Fotoğraf, imza, teslim kodu." },
    { sticker: "kart", title: "Kazanç ve vardiya", body: "Hepsi tek ekranda." },
  ] as Feature[],
  links: [{ label: "İletişim", href: `${BRAND.siteUrl}/iletisim` }],
};

/** Decorative/informational side panel; does not affect app behaviour. */
function BrandPanel({ width }: { width: number }) {
  const { profile } = useSession();
  const c = profile?.role === "kurye" ? COURIER : CUSTOMER;
  const { height } = useWindowDimensions();
  // Short windows (e.g. 1366×768): tighter title and spacing so the panel fits without scrolling
  const compact = height < 860;
  const titleSize = compact ? 60 : 72;
  const gap = compact ? 18 : 26;

  return (
    <View role="complementary" aria-label={`${BRAND.name} hakkında`} style={{ width, height: "100%" }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 36, gap }}
        showsVerticalScrollIndicator={false}
      >
        <Wordmark size={compact ? 40 : 46} />

        {/* Title with stickers in the free space to the right of the short lines */}
        <View style={{ gap: 14 }}>
          <InkChip>{c.kicker}</InkChip>
          <View>
            <Text
              role="heading"
              aria-level={2}
              style={{ ...type.hero, fontSize: titleSize, lineHeight: titleSize * 0.94, letterSpacing: -titleSize * 0.055 }}
            >
              {c.title}
            </Text>
            {/* Offsets scale with the title size: lines are at most ~3.6×size wide */}
            <Sticker name="pin" size={titleSize * 0.8} rotation={10} style={{ position: "absolute", left: titleSize * c.pin.left, top: titleSize * c.pin.top }} />
            <Sticker name="motor" size={titleSize * 1.6} rotation={-6} style={{ position: "absolute", right: 0, top: titleSize * 0.35 }} />
            <Sticker name="kutu" size={titleSize * 0.8} rotation={8} style={{ position: "absolute", left: titleSize * 3.75, top: titleSize * 1.9 }} />
          </View>
        </View>

        <Text style={{ ...font("semibold"), fontSize: 16, lineHeight: 23, color: colors.mutedDark, maxWidth: 400 }}>{c.lead}</Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: compact ? 12 : 16, columnGap: 12 }}>
          {c.features.map((f) => (
            <View key={f.title} style={{ width: (width - 12) / 2, flexDirection: "row", gap: 10, alignItems: "center" }}>
              <View style={{ width: 52, height: 52, alignItems: "center", justifyContent: "center" }}>
                <Sticker name={f.sticker} size={compact ? 42 : 48} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ ...font("black"), fontSize: 15, letterSpacing: -0.3, color: colors.ink }}>{f.title}</Text>
                <Text style={{ ...font("semibold"), fontSize: 13, lineHeight: 18, color: colors.muted }}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <DownloadCard />

        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 18, rowGap: 6 }}>
          <Link href={BRAND.siteUrl} target="_blank" rel="noopener" style={{ ...font("extrabold"), fontSize: 14, color: colors.ink }}>
            {`${BRAND.domain} ↗`}
          </Link>
          {c.links.map((l) => (
            <Link key={l.href} href={l.href} target="_blank" rel="noopener" style={{ ...font("bold"), fontSize: 14, color: colors.mutedDark }}>
              {l.label}
            </Link>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** Store links do not exist yet: plain text, no fake links. */
function DownloadCard() {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Sticker name="telefon" size={58} rotation={-6} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text role="heading" aria-level={3} style={type.h3}>
            Uygulamayı telefona indir
          </Text>
          <Text style={{ ...font("semibold"), fontSize: 14, color: colors.muted }}>Yakında App Store ve Google Play&apos;de.</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <StoreSoon icon="logo-apple" label="App Store" />
        <StoreSoon icon="logo-google-playstore" label="Google Play" />
      </View>
    </View>
  );
}

function StoreSoon({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View
      aria-label={`${label}: yakında`}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: colors.bg,
        borderRadius: radii.pill,
        paddingVertical: 11,
        paddingHorizontal: 12,
      }}
    >
      <Ionicons name={icon} size={18} color={colors.ink} />
      <Text numberOfLines={1} style={{ ...font("extrabold"), fontSize: 14, color: colors.ink }}>
        {label}
      </Text>
    </View>
  );
}
