import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { Text } from "react-native";
import { Sticker } from "@/components/Sticker";
import { Button, Card, Muted, Screen, colors, font } from "@/components/ui";

/**
 * Ödeme dönüş sayfası. Uygulamada derin bağlantı (yazgankurye://odeme), tarayıcıda
 * (Expo web) iyzico'dan dönülen adres. Ödeme açılır pencerede yapıldıysa pencere kendiliğinden kapanır;
 * aynı sekmede açıldıysa sipariş ekranına yönlendirilir. Sonuç her zaman sunucuda doğrulanır.
 */
export default function OdemeDonus() {
  const { durum, siparis } = useLocalSearchParams<{ durum?: string; siparis?: string }>();
  const ok = durum === "basarili";

  useEffect(() => {
    if (!siparis) return;
    const t = setTimeout(() => router.replace(`/siparis/${siparis}`), 1500);
    return () => clearTimeout(t);
  }, [siparis]);

  return (
    <Screen>
      <Sticker name="kart" size={120} rotation={-8} style={{ alignSelf: "center", marginTop: 12 }} />
      <Card>
        <Text style={{ fontSize: 20, ...font("black"), color: ok ? colors.success : colors.danger }}>
          {ok ? "Ödemeniz alındı" : "Ödeme tamamlanamadı"}
        </Text>
        <Muted>{siparis ? "Siparişinize yönlendiriliyorsunuz…" : "Siparişlerim ekranından durumu görebilirsiniz."}</Muted>
        <Button title="Siparişlerim" variant="secondary" onPress={() => router.replace("/siparisler")} />
      </Card>
    </Screen>
  );
}
