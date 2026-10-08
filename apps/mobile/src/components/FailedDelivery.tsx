import { FAILED_DELIVERY_REASONS, FAILED_REASONS_REQUIRING_WAIT, type FailedDeliveryReason } from "@yazgan/shared";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { Button, Card, ErrorBox, Muted, colors, styles, font } from "@/components/ui";
import { ApiError, type OrderDetail } from "@/lib/api";
import { callPhone } from "@/lib/navigation";
import { outbox } from "@/lib/outbox";

/**
 * Teslim edilemedi: neden, alıcıyı arama, adres fotoğrafı. Sunucu varış ve en az bekleme şartını denetler
 * (alıcı reddettiyse / adres bulunamadıysa bekleme gerekmez). Paket göndericiye döner.
 */
export function FailedDeliveryForm({
  order,
  now,
  onDone,
  onCancel,
}: {
  order: OrderDetail;
  now: number;
  /** queued: bağlantı yok, telefonda sıraya alındı */
  onDone: (queued: boolean) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<FailedDeliveryReason | null>(null);
  const [calls, setCalls] = useState(0);
  const [note, setNote] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waited = order.arrivedDropoffAt ? Math.max(0, Math.floor((now - new Date(order.arrivedDropoffAt).getTime()) / 60_000)) : null;
  const needsWait = !!reason && FAILED_REASONS_REQUIRING_WAIT.includes(reason);

  async function takePhoto() {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Kamera izni gerekli");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.5 });
    if (!res.canceled && res.assets[0]) setPhotoUri(res.assets[0].uri);
  }

  async function submit() {
    if (!reason || !photoUri) return;
    setBusy(true);
    setError(null);
    try {
      const base = { orderId: order.id, orderNo: order.orderNo };
      const r = await outbox.run([
        { kind: "failed", ...base, input: { reason, note, callAttempts: calls, photoUri }, fileStamp: Date.now() },
        { kind: "reprice", ...base },
      ]);
      onDone(r === "queued");
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 10, borderColor: colors.danger }}>
      <Text style={{ ...font("extrabold"), fontSize: 16 }}>Teslim edilemedi</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {(Object.keys(FAILED_DELIVERY_REASONS) as FailedDeliveryReason[]).map((r) => (
          <Pressable
            key={r}
            onPress={() => setReason(r)}
            testID={`failed-reason-${r}`}
            style={{
              borderWidth: 2,
              borderColor: reason === r ? colors.danger : colors.border,
              backgroundColor: reason === r ? colors.dangerLight : colors.card,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text>{FAILED_DELIVERY_REASONS[r]}</Text>
          </Pressable>
        ))}
      </View>
      {needsWait ? (
        <Muted>
          {waited == null
            ? "Önce \"Teslim adresine vardım\" deyin; alıcıyı en az 10 dakika beklemeniz gerekir."
            : `Varıştan beri ${waited} dk bekliyorsunuz (en az 10 dk).`}
        </Muted>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            title="Alıcıyı ara"
            variant="secondary"
            disabled={!order.dropoffContactPhone}
            onPress={() => {
              setCalls((c) => c + 1);
              if (order.dropoffContactPhone) callPhone(order.dropoffContactPhone);
            }}
          />
        </View>
        <Pressable onPress={() => setCalls((c) => c + 1)} testID="failed-call-plus" style={{ padding: 10 }}>
          <Text testID="failed-calls" style={{ ...font("extrabold") }}>
            Arama: {calls} (+)
          </Text>
        </Pressable>
      </View>
      {photoUri ? <Image source={{ uri: photoUri }} style={{ width: "100%", height: 160, borderRadius: 10 }} resizeMode="cover" /> : null}
      <Button title={photoUri ? "Fotoğrafı yeniden çek" : "Adresin fotoğrafını çek (zorunlu)"} variant="secondary" onPress={takePhoto} testID="failed-photo" />
      <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Not (ör. kapı kilitli, telefon kapalı)" multiline testID="failed-note" />
      <ErrorBox message={error} />
      <Button
        title="Göndericiye iade başlat"
        variant="danger"
        onPress={submit}
        loading={busy}
        disabled={!reason || !photoUri || (reason === "alici_yok" && calls < 1) || (reason === "diger" && note.trim().length < 3)}
        testID="failed-submit"
      />
      <Muted>Paket göndericiye geri götürülür; dönüş ayağı ücreti müşteriye eklenir.</Muted>
      <Button title="Vazgeç" variant="secondary" onPress={onCancel} />
    </Card>
  );
}
