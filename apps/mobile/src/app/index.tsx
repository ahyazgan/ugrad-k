import { Redirect } from "expo-router";
import { Loading } from "@/components/ui";
import { useSession } from "@/lib/session";

/** Açılış yönlendirmesi: giriş → KVKK onayı → role göre ana ekran. */
export default function Index() {
  const { loading, session, profile, consented } = useSession();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/giris" />;
  if (!consented) return <Redirect href="/kvkk" />;
  if (profile?.role === "kurye") return <Redirect href="/(musteri)" />; // Faz 4: kurye ekranları
  return <Redirect href="/(musteri)" />;
}
