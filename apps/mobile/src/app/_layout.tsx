import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@/components/ui";
import { OrderDraftProvider } from "@/lib/order-draft";
import { SessionProvider } from "@/lib/session";
// Arka plan konum görevi uygulama açılışında tanımlanmalı
import "@/lib/location";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <OrderDraftProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.primary },
              headerTintColor: "#fff",
              headerTitleStyle: { fontWeight: "600" },
              contentStyle: { backgroundColor: colors.bg },
              headerBackTitle: "Geri",
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="giris" options={{ title: "Giriş" }} />
            <Stack.Screen name="dogrula" options={{ title: "Doğrulama" }} />
            <Stack.Screen name="kvkk" options={{ title: "Kişisel Veriler", headerBackVisible: false }} />
            <Stack.Screen name="(musteri)" options={{ headerShown: false }} />
            <Stack.Screen name="adres" options={{ title: "Adres seç", presentation: "modal" }} />
            <Stack.Screen name="ozet" options={{ title: "Fiyat ve onay" }} />
            <Stack.Screen name="siparis/[id]" options={{ title: "Sipariş" }} />
            <Stack.Screen name="odeme" options={{ title: "Ödeme" }} />
            <Stack.Screen name="(kurye)" options={{ headerShown: false }} />
            <Stack.Screen name="is/[id]" options={{ title: "İş detayı" }} />
            <Stack.Screen name="teslim/[id]" options={{ title: "Teslim et" }} />
          </Stack>
        </OrderDraftProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
