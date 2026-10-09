import { Archivo_500Medium } from "@expo-google-fonts/archivo/500Medium";
import { Archivo_600SemiBold } from "@expo-google-fonts/archivo/600SemiBold";
import { Archivo_700Bold } from "@expo-google-fonts/archivo/700Bold";
import { Archivo_800ExtraBold } from "@expo-google-fonts/archivo/800ExtraBold";
import { Archivo_900Black } from "@expo-google-fonts/archivo/900Black";
import { CaveatBrush_400Regular } from "@expo-google-fonts/caveat-brush/400Regular";
import { useFonts } from "expo-font";
import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors, fontFamilies } from "@/components/ui";
import { WebFrame } from "@/components/WebFrame";
import { OrderDraftProvider } from "@/lib/order-draft";
import { SessionProvider } from "@/lib/session";
// Arka plan konum görevi uygulama açılışında tanımlanmalı
import "@/lib/location";

// Yalnız kullanılan ağırlıklar paketlenir (alt yol içe aktarımları)
const FONTS = {
  [fontFamilies.medium]: Archivo_500Medium,
  [fontFamilies.semibold]: Archivo_600SemiBold,
  [fontFamilies.bold]: Archivo_700Bold,
  [fontFamilies.extrabold]: Archivo_800ExtraBold,
  [fontFamilies.black]: Archivo_900Black,
  [fontFamilies.hand]: CaveatBrush_400Regular,
};

/** Neo: lila zemin, beyaz kartlar, mürekkep yazı (gezinme kapsayıcıları ve sekme çubuğu arka planı) */
const NEO_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.ink,
    background: colors.bg,
    card: colors.surface,
    text: colors.ink,
    border: "transparent",
    notification: colors.lime,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONTS);
  // Yerel yazı tipleri genelde anında yüklenir; hata olursa sistem yazı tipiyle devam edilir.
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={NEO_THEME}>
        <SessionProvider>
          <OrderDraftProvider>
            <StatusBar style="dark" />
            {/* Desktop web: centered phone-width column (+ brand panel); no-op on native and mobile web */}
            <WebFrame>
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.bg },
                  headerTintColor: colors.ink,
                  headerShadowVisible: false,
                  headerTitleStyle: { fontFamily: fontFamilies.black, fontSize: 18 },
                  contentStyle: { backgroundColor: colors.bg },
                  headerBackTitle: "Geri",
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="giris" options={{ title: "Giriş", headerShown: false }} />
                <Stack.Screen name="dogrula" options={{ title: "Doğrulama", headerTitle: "" }} />
                {/* KVKK: büyük başlık ekranın içinde; geri dönüş yok */}
                <Stack.Screen name="kvkk" options={{ title: "Kişisel Veriler", headerShown: false }} />
                <Stack.Screen name="(musteri)" options={{ headerShown: false }} />
                <Stack.Screen name="adres" options={{ title: "Adres seç", headerTitle: "", presentation: "modal" }} />
                <Stack.Screen name="ozet" options={{ title: "Fiyat ve onay" }} />
                <Stack.Screen name="siparis/[id]" options={{ title: "Sipariş" }} />
                <Stack.Screen name="odeme" options={{ title: "Ödeme" }} />
                <Stack.Screen name="(kurye)" options={{ headerShown: false }} />
                <Stack.Screen name="is/[id]" options={{ title: "İş detayı" }} />
                <Stack.Screen name="teslim/[id]" options={{ title: "Teslim et", headerTitle: "" }} />
                <Stack.Screen name="sos" options={{ title: "Acil durum" }} />
                <Stack.Screen name="mesajlar/[id]" options={{ title: "Mesajlar" }} />
              </Stack>
            </WebFrame>
          </OrderDraftProvider>
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
