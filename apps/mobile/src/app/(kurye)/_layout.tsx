import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { useEffect } from "react";
import { tabIcon, useNeoTabOptions } from "@/components/NeoTabs";
import { startOutboxSync } from "@/lib/outbox";
import { useSession } from "@/lib/session";

export default function KuryeLayout() {
  const { loading, session, consented, profile } = useSession();
  const tabOptions = useNeoTabOptions();
  // Çevrimdışı kuyruktaki kurye işlemlerini bağlantı gelince gönder
  useEffect(() => startOutboxSync(), []);
  if (!loading && (!session || !consented || profile?.role !== "kurye")) return <Redirect href="/" />;
  return (
    <Tabs screenOptions={tabOptions}>
      <Tabs.Screen name="index" options={{ title: "İşlerim", tabBarIcon: tabIcon("bicycle", "bicycle-outline") }} />
      <Tabs.Screen name="vardiya" options={{ title: "Vardiyam", tabBarIcon: tabIcon("calendar", "calendar-outline") }} />
      <Tabs.Screen name="kazanc" options={{ title: "Kazancım", tabBarIcon: tabIcon("wallet", "wallet-outline") }} />
      <Tabs.Screen name="hesap" options={{ title: "Hesabım", tabBarIcon: tabIcon("person", "person-outline") }} />
    </Tabs>
  );
}
