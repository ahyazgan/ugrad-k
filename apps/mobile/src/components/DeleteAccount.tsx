import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { api, ApiError } from "@/lib/api";
import { stopTracking } from "@/lib/location";
import { Button, Card, ErrorBox, Muted, colors, font } from "./ui";

/** App Store / Google Play gereği uygulama içinden hesap silme. */
export function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return <Button title="Hesabımı sil" variant="secondary" onPress={() => setConfirming(true)} testID="delete-account" />;
  }
  return (
    <Card style={{ borderWidth: 2, borderColor: colors.danger }}>
      <Text style={{ ...font("extrabold"), color: colors.danger }}>Hesabınız silinsin mi?</Text>
      <Muted>
        Adınız, telefonunuz, e-postanız ve kayıtlı adresleriniz silinir; tekrar giriş yapamazsınız. Geçmiş sipariş ve
        fatura kayıtları vergi mevzuatı gereği anonim olarak saklanır. Devam eden siparişiniz varsa önce tamamlanmalıdır.
      </Muted>
      <ErrorBox message={error} />
      <Button
        title="Evet, hesabımı sil"
        variant="danger"
        loading={busy}
        testID="delete-account-confirm"
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await stopTracking();
            await api.deleteAccount();
            router.replace("/giris");
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Hesap silinemedi");
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button title="Vazgeç" variant="secondary" onPress={() => setConfirming(false)} />
    </Card>
  );
}
