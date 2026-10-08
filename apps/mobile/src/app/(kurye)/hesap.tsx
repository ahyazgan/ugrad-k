import { router } from "expo-router";
import { DeleteAccount } from "@/components/DeleteAccount";
import { Button, Card, Muted, Screen, Title } from "@/components/ui";
import { api } from "@/lib/api";
import { COMPANY } from "@/lib/kvkk";
import { stopTracking } from "@/lib/location";
import { useSession } from "@/lib/session";

export default function KuryeHesap() {
  const { profile } = useSession();
  return (
    <Screen>
      <Card>
        <Title>{profile?.fullName ?? "Kurye"}</Title>
        <Muted>{profile?.phone}</Muted>
        <Muted>Bilgilerinizde değişiklik için yöneticinize başvurun.</Muted>
      </Card>
      <Button
        title="Çıkış yap"
        variant="secondary"
        onPress={async () => {
          await stopTracking();
          await api.signOut();
          router.replace("/giris");
        }}
      />
      <DeleteAccount />
      <Muted style={{ textAlign: "center", fontSize: 12 }}>{COMPANY.title}</Muted>
    </Screen>
  );
}
