import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { BigTitle, HandTag } from "@/components/Neo";
import { Sticker } from "@/components/Sticker";
import { Button, ErrorBox, Muted, Screen, Txt, colors, font, radii } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

/** Yeni kod istemeden önce beklenecek süre (sn); SMS sağlayıcısını gereksiz tekrarlardan korur */
const RESEND_AFTER_S = 60;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function Dogrula() {
  const { phone = "" } = useLocalSearchParams<{ phone: string }>();
  const { refresh } = useSession();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [left, setLeft] = useState(RESEND_AFTER_S);
  const [resending, setResending] = useState(false);

  // Geri sayım: "Kodu tekrar gönder (0:42)"
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

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
    setInfo(null);
    setResending(true);
    try {
      await api.sendOtp(phone);
      setInfo("Yeni kod yolda!");
      setLeft(RESEND_AFTER_S);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kod gönderilemedi");
    } finally {
      setResending(false);
    }
  }

  function changeNumber() {
    if (router.canGoBack()) router.back();
    else router.replace("/giris");
  }

  const waiting = left > 0;

  return (
    <Screen>
      <View style={{ marginTop: 4 }}>
        <BigTitle size={64}>{"Kodu\ngir."}</BigTitle>
        {info ? (
          <HandTag rotate={-8} style={{ position: "absolute", right: 8, bottom: 10 }}>
            {info}
          </HandTag>
        ) : null}
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
      <Button title="Doğrula ve başla" onPress={submit} loading={loading} disabled={code.length !== 6} testID="verify" />

      {/* Kod gelmediyse: geri sayımlı tekrar gönder + numara değiştir */}
      <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Sticker name="kronometre" size={44} rotation={10} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt weight="extrabold" size={15}>
            Kod gelmedi mi?
          </Txt>
          <Pressable
            testID="otp-resend"
            accessibilityRole="button"
            accessibilityState={{ disabled: waiting || resending }}
            disabled={waiting || resending}
            onPress={resend}
            hitSlop={8}
            style={{ alignSelf: "flex-start", minHeight: 28, justifyContent: "center" }}
          >
            <Txt
              weight="extrabold"
              size={14}
              color={waiting ? colors.muted : colors.ink}
              style={{ textDecorationLine: waiting ? "none" : "underline", fontVariant: ["tabular-nums"] }}
            >
              {waiting ? `Kodu tekrar gönder (${mmss(left)})` : resending ? "Gönderiliyor…" : "Kodu tekrar gönder"}
            </Txt>
          </Pressable>
        </View>
      </View>
      <Pressable testID="otp-change-number" accessibilityRole="button" onPress={changeNumber} hitSlop={8} style={{ alignSelf: "center", minHeight: 44, justifyContent: "center" }}>
        <Txt size={14} color={colors.mutedDark}>
          Numara yanlış mı?{" "}
          <Txt weight="extrabold" size={14} style={{ textDecorationLine: "underline" }}>
            Değiştir
          </Txt>
        </Txt>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Ionicons name="lock-closed" size={14} color={colors.muted} />
        <Txt size={13} color={colors.muted}>
          Numaran kuryeyle paylaşılmaz.
        </Txt>
      </View>
    </Screen>
  );
}
