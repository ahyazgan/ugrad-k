import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { tabIcon, useNeoTabOptions } from "@/components/NeoTabs";
import { useSession } from "@/lib/session";

export default function MusteriLayout() {
  const { loading, session, consented, profile } = useSession();
  const tabOptions = useNeoTabOptions();
  if (!loading && (!session || !consented || profile?.role === "kurye")) return <Redirect href="/" />;
  return (
    <Tabs screenOptions={tabOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Ana Sayfa",
          headerShown: false,
          tabBarIcon: tabIcon("home", "home-outline"),
        }}
      />
      <Tabs.Screen name="siparisler" options={{ title: "Siparişlerim", tabBarIcon: tabIcon("cube", "cube-outline") }} />
      <Tabs.Screen name="hesap" options={{ title: "Hesabım", tabBarIcon: tabIcon("person", "person-outline") }} />
    </Tabs>
  );
}
