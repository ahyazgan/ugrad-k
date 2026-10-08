import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { Button, Card, Checkbox, ErrorBox, Muted, Screen, Title, colors } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { ACIK_RIZA_KONUM, AYDINLATMA_METNI, KVKK_VERSION, TICARI_ILETI } from "@/lib/kvkk";
import { useSession } from "@/lib/session";

export default function Kvkk() {
  const { refresh } = useSession();
  const [read, setRead] = useState(false);
  const [location, setLocation] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await api.saveConsents(
        [
          { type: "kvkk_aydinlatma", granted: true },
          { type: "acik_riza_konum", granted: true },
          { type: "ticari_ileti", granted: marketing },
        ],
        KVKK_VERSION,
      );
      await refresh();
      router.replace("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Title>Aydınlatma metni</Title>
      <Card style={{ maxHeight: 320 }}>
        <ScrollView nestedScrollEnabled>
          <Text style={{ color: colors.text, lineHeight: 21 }}>{AYDINLATMA_METNI}</Text>
        </ScrollView>
      </Card>
      <Card>
        <Checkbox checked={read} onChange={setRead}>
          <Text style={{ fontWeight: "600" }}>Aydınlatma metnini okudum, anladım.</Text>
        </Checkbox>
        <Checkbox checked={location} onChange={setLocation}>
          <Text style={{ fontWeight: "600" }}>Açık rıza (zorunlu)</Text>
          <Muted>{ACIK_RIZA_KONUM}</Muted>
        </Checkbox>
        <Checkbox checked={marketing} onChange={setMarketing}>
          <Muted>{TICARI_ILETI}</Muted>
        </Checkbox>
      </Card>
      <ErrorBox message={error} />
      <Button title="Onayla ve devam et" onPress={submit} loading={loading} disabled={!read || !location} testID="kvkk-accept" />
      <Button
        title="Çıkış yap"
        variant="secondary"
        onPress={async () => {
          await api.signOut();
          router.replace("/giris");
        }}
      />
    </Screen>
  );
}
