import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { useEffect } from "react";
import { tabIcon, useNeoTabOptions } from "@/components/NeoTabs";
import { startOutboxSync } from "@/lib/outbox";
import { entryRoute, useSession } from "@/lib/session";

export default function KuryeLayout() {
  const state = useSession();
  const tabOptions = useNeoTabOptions();
  // Çevrimdışı kuyruktaki kurye işlemlerini bağlantı gelince gönder
  useEffect(() => startOutboxSync(), []);
  const target = entryRoute(state);
  if (!state.loading && target !== "/(kurye)") return <Redirect href={target} />;
  return (
    <Tabs screenOptions={tabOptions}>
      <Tabs.Screen name="index" options={{ title: "İşlerim", headerShown: false, tabBarIcon: tabIcon("bicycle", "bicycle-outline") }} />
      {/* Sekme kökleri: başlık ekranın içinde (BigTitle + sağ üstte tek çıkartma) */}
      <Tabs.Screen name="vardiya" options={{ title: "Vardiyam", headerShown: false, tabBarIcon: tabIcon("calendar", "calendar-outline") }} />
      <Tabs.Screen name="kazanc" options={{ title: "Kazancım", headerShown: false, tabBarIcon: tabIcon("wallet", "wallet-outline") }} />
      <Tabs.Screen name="hesap" options={{ title: "Hesabım", headerShown: false, tabBarIcon: tabIcon("person", "person-outline") }} />
    </Tabs>
  );
}
