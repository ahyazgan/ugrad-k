import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Text, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, shadow } from "./theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Sekme simgesi: etkin sekmede dolu, diğerlerinde çizgi simge */
export function tabIcon(filled: IconName, outline: IconName) {
  function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={focused ? filled : outline} color={color as string} size={24} />;
  }
  return TabIcon;
}

/** Etiket + etkin sekmenin altındaki küçük limon nokta */
function TabLabel({ focused, color, children }: { focused: boolean; color: ColorValue; children: string }) {
  return (
    <View style={{ alignItems: "center", gap: 3 }}>
      <Text style={{ ...font(focused ? "extrabold" : "bold"), color, fontSize: 12 }}>{children}</Text>
      <View style={{ width: 6, height: 6, borderRadius: 99, backgroundColor: focused ? colors.limeDot : "transparent" }} />
    </View>
  );
}

/** Neo sekme çubuğu: beyaz, yuvarlak köşeli, zeminden ayrık (yüzen) çubuk + lila başlık */
export function useNeoTabOptions() {
  const insets = useSafeAreaInsets();
  return {
    headerStyle: { backgroundColor: colors.bg },
    headerTintColor: colors.ink,
    headerShadowVisible: false,
    headerTitleStyle: { ...font("black"), fontSize: 18 },
    sceneStyle: { backgroundColor: colors.bg },
    tabBarActiveTintColor: colors.ink,
    tabBarInactiveTintColor: colors.inactive,
    tabBarLabel: TabLabel,
    tabBarStyle: {
      height: 74,
      paddingTop: 8,
      paddingBottom: 6,
      marginHorizontal: 12,
      marginBottom: insets.bottom + 12,
      borderRadius: 28,
      borderTopWidth: 0,
      backgroundColor: colors.surface,
      ...shadow,
    },
  };
}
