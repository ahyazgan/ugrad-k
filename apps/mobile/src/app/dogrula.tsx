import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Button, Card, ErrorBox, Field, Muted, Screen, Title } from "@/components/ui";
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
      <Card>
        <Title>Kodu girin</Title>
        <Muted>{phone} numarasına gönderilen 6 haneli kodu girin.</Muted>
        <Field
          label="Doğrulama kodu"
          placeholder="______"
          keyboardType="number-pad"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          maxLength={6}
          value={code}
          onChangeText={setCode}
          onSubmitEditing={submit}
          testID="otp"
        />
        <ErrorBox message={error} />
        {info ? <Muted>{info}</Muted> : null}
        <Button title="Doğrula" onPress={submit} loading={loading} disabled={code.length !== 6} testID="verify" />
        <Button title="Kodu tekrar gönder" variant="secondary" onPress={resend} />
      </Card>
    </Screen>
  );
}
