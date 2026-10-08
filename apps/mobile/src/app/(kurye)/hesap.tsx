import type { Compliance } from "@yazgan/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { complianceFor, DocumentList } from "@/components/CourierDocs";
import { DeleteAccount } from "@/components/DeleteAccount";
import { Button, Card, Muted, Screen, Title } from "@/components/ui";
import { api } from "@/lib/api";
import { COMPANY } from "@/lib/kvkk";
import { stopTracking } from "@/lib/location";
import { useSession } from "@/lib/session";

export default function KuryeHesap() {
  const { profile } = useSession();
  const [compliance, setCompliance] = useState<Compliance | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.courierDocuments().then((d) => setCompliance(complianceFor(d)), () => undefined);
    }, []),
  );
  return (
    <Screen>
      <Card>
        <Title>{profile?.fullName ?? "Kurye"}</Title>
        <Muted>{profile?.phone}</Muted>
        <Muted>Bilgilerinizde değişiklik için yöneticinize başvurun.</Muted>
      </Card>
      {compliance ? <DocumentList c={compliance} /> : null}
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
