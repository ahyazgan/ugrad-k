import { Redirect } from "expo-router";
import { Loading } from "@/components/ui";
import { entryRoute, useSession } from "@/lib/session";

/** Açılış yönlendirmesi: giriş → KVKK onayı → role göre ana ekran. */
export default function Index() {
  const state = useSession();
  if (state.loading) return <Loading />;
  return <Redirect href={entryRoute(state)} />;
}
