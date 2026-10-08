import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { BigTitle, HandTag } from "@/components/Neo";
import { Sticker } from "@/components/Sticker";
import { Button, ErrorBox, Muted, Screen, colors, font } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function Dogrula() {
  const { phone = "" } = useLocalSearchParams<{ phone: string }>();
  const { refresh } = useSession();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      await api.verifyOtp(phone, code.trim());
      await refresh();
      // Giriş ekranlarını yığından temizle
      if (router.canDismiss()) router.dismissAll();
      router.replace("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      await api.sendOtp(phone);
      setInfo("Yeni kod gönderildi");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kod gönderilemedi");
    }
  }

  return (
    <Screen>
      <View style={{ marginTop: 4 }}>
        <BigTitle size={64}>{"Kodu\ngir."}</BigTitle>
        <Sticker name="kronometre" size={72} rotation={10} style={{ position: "absolute", right: 24, top: -8 }} />
      </View>
      <Muted>{phone} numarasına SMS ile gönderdiğimiz 6 haneli kodu gir.</Muted>
      <TextInput
        accessibilityLabel="Doğrulama kodu"
        placeholder="••••••"
        placeholderTextColor={colors.border}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={6}
        value={code}
        onChangeText={setCode}
        onSubmitEditing={submit}
        testID="otp"
        style={{
          ...font("black"),
          backgroundColor: colors.surface,
          borderRadius: 20,
          borderWidth: 2,
          borderColor: code.length === 6 ? colors.ink : "transparent",
          height: 70,
          fontSize: 32,
          letterSpacing: 14,
          textAlign: "center",
          color: colors.ink,
        }}
      />
      <ErrorBox message={error} />
      {info ? <HandTag rotate={-4}>{info}</HandTag> : null}
      <Pressable accessibilityRole="button" onPress={resend} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
        <Text style={{ ...font("extrabold"), fontSize: 14, color: colors.ink, textDecorationLine: "underline" }}>Kodu tekrar gönder</Text>
      </Pressable>
      <Button title="Doğrula ve başla" onPress={submit} loading={loading} disabled={code.length !== 6} testID="verify" />
    </Screen>
  );
}
