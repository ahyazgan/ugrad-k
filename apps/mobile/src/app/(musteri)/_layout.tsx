import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { colors } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function MusteriLayout() {
  const { loading, session, consented } = useSession();
  if (!loading && (!session || !consented)) return <Redirect href="/" />;
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
        options={{
          title: "Gönderi oluştur",
          tabBarLabel: "Gönder",
          tabBarIcon: ({ color, size }) => <Ionicons name="paper-plane" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="siparisler"
        options={{
          title: "Siparişlerim",
          tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="hesap"
        options={{
          title: "Hesabım",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
