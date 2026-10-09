import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { tabIcon, useNeoTabOptions } from "@/components/NeoTabs";
import { entryRoute, useSession } from "@/lib/session";

export default function MusteriLayout() {
  const state = useSession();
  const tabOptions = useNeoTabOptions();
  const target = entryRoute(state);
  if (!state.loading && target !== "/(musteri)") return <Redirect href={target} />;
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
      <Tabs.Screen name="siparisler" options={{ title: "Siparişlerim", headerShown: false, tabBarIcon: tabIcon("cube", "cube-outline") }} />
      <Tabs.Screen name="hesap" options={{ title: "Hesabım", headerShown: false, tabBarIcon: tabIcon("person", "person-outline") }} />
    </Tabs>
  );
}
