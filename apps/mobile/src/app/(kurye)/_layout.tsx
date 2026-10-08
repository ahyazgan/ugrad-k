import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { colors } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function KuryeLayout() {
  const { loading, session, consented, profile } = useSession();
  if (!loading && (!session || !consented || profile?.role !== "kurye")) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: "#fff",
        tabBarActiveTintColor: colors.primary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "İşlerim", tabBarIcon: ({ color, size }) => <Ionicons name="bicycle" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="hesap"
        options={{ title: "Hesabım", tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
