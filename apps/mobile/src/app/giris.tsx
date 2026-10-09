import { router } from "expo-router";
import { useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, TextInput, View, useWindowDimensions } from "react-native";
import { BigTitle, HandTag, InkChip, Wordmark } from "@/components/Neo";
import { Sticker } from "@/components/Sticker";
import { Button, Card, ErrorBox, Muted, Screen, colors, font, radii } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export default function Giris() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  // "Selam." satırının sağındaki boşluğa sığacak çıkartma genişliği
  const phoneSticker = Math.max(48, Math.min(104, width - 32 - 240));

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
    <Screen safeTop>
      <View style={{ marginTop: 10 }}>
        <Wordmark size={40} />
      </View>
      <View style={{ marginTop: 18, marginBottom: 6 }}>
        <Sticker name="telefon" size={phoneSticker} rotation={10} style={{ position: "absolute", right: 6, top: -6 }} />
        <BigTitle size={68}>{"Selam.\nHadi\nbaşla."}</BigTitle>
        <HandTag rotate={-10} style={{ position: "absolute", right: 8, bottom: 14 }}>
          {"30 sn'de\ngiriş!"}
        </HandTag>
      </View>
      <Muted>Acil evrak ve paketlerin, moto kurye ile kapıdan kapıya.</Muted>
      {api.mode === "demo" ? (
        <Card style={{ gap: 6 }}>
          <InkChip>DEMO MODU</InkChip>
          <Muted>Sunucu bağlantısı henüz yapılmadı. Herhangi bir numara ve 123456 koduyla giriş yapabilirsiniz.</Muted>
        </Card>
      ) : null}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radii.pill,
          minHeight: 64,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 8,
          gap: 10,
        }}
      >
        <View style={{ height: 48, width: 48, borderRadius: radii.pill, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="call" size={20} color={colors.ink} />
        </View>
        <TextInput
          accessibilityLabel="Cep telefonu"
          placeholder="05xx xxx xx xx"
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          autoComplete="tel"
          value={phone}
          onChangeText={setPhone}
          onSubmitEditing={submit}
          testID="phone"
          style={{ ...font("extrabold"), flex: 1, fontSize: 20, letterSpacing: 0.5, color: colors.ink, paddingVertical: 12 }}
        />
      </View>
      <ErrorBox message={error} />
      <Button title="Kod gönder" onPress={submit} loading={loading} disabled={phone.length < 10} testID="send-otp" />
      <Muted style={{ textAlign: "center" }}>Telefonunuza SMS ile 6 haneli bir kod göndereceğiz.</Muted>
      <View
        style={{
          marginTop: 12,
          minHeight: 58,
          borderRadius: radii.pill,
          backgroundColor: colors.ink,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 22,
          paddingRight: 8,
          gap: 10,
        }}
      >
        <Text style={{ ...font("bold"), flex: 1, color: "#fff", fontSize: 14 }}>
          Kurye misiniz? <Text style={{ ...font("black"), color: colors.lime }}>Buradan girin</Text>
        </Text>
        <View style={{ width: 44, height: 44, borderRadius: radii.pill, backgroundColor: colors.lime, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="bicycle" size={20} color={colors.ink} />
        </View>
      </View>
    </Screen>
  );
}
