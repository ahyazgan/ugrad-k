import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { tabIcon, useNeoTabOptions } from "@/components/NeoTabs";
import { useSession } from "@/lib/session";

export default function KuryeLayout() {
  const { loading, session, consented, profile } = useSession();
  const tabOptions = useNeoTabOptions();
  if (!loading && (!session || !consented || profile?.role !== "kurye")) return <Redirect href="/" />;
  return (
    <Tabs screenOptions={tabOptions}>
      <Tabs.Screen name="index" options={{ title: "İşlerim", headerShown: false, tabBarIcon: tabIcon("bicycle", "bicycle-outline") }} />
      <Tabs.Screen name="hesap" options={{ title: "Hesabım", headerShown: false, tabBarIcon: tabIcon("person", "person-outline") }} />
    </Tabs>
  );
}
