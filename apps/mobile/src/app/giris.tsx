import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, ErrorBox, Field, Muted, Screen, Title, colors } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { BRAND } from "@yazgan/shared";

export default function Giris() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      await api.sendOtp(phone);
      router.push({ pathname: "/dogrula", params: { phone } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 6, marginTop: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", color: colors.primary }}>{BRAND.name}</Text>
        <Muted>Acil evrak ve paketleriniz, moto kurye ile kapıdan kapıya.</Muted>
      </View>
      {api.mode === "demo" ? (
        <Card style={{ backgroundColor: "#FFFBEB", borderColor: colors.accent }}>
          <Text style={{ fontWeight: "700" }}>Demo modu</Text>
          <Muted>Sunucu bağlantısı henüz yapılmadı. Herhangi bir numara ve 123456 koduyla giriş yapabilirsiniz.</Muted>
        </Card>
      ) : null}
      <Card>
        <Title>Giriş yap</Title>
        <Field
          label="Cep telefonu"
          placeholder="05xx xxx xx xx"
          keyboardType="phone-pad"
          autoComplete="tel"
          value={phone}
          onChangeText={setPhone}
          onSubmitEditing={submit}
          testID="phone"
        />
        <ErrorBox message={error} />
        <Button title="Doğrulama kodu gönder" onPress={submit} loading={loading} disabled={phone.length < 10} testID="send-otp" />
        <Muted>Numaranıza SMS ile 6 haneli bir kod göndereceğiz.</Muted>
      </Card>
    </Screen>
  );
}
