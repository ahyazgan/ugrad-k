import Ionicons from "@expo/vector-icons/Ionicons";
import { FAILED_DELIVERY_REASONS, FAILED_REASONS_REQUIRING_WAIT, type FailedDeliveryReason } from "@yazgan/shared";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Image, Pressable, TextInput, View } from "react-native";
import { Sticker } from "@/components/Sticker";
import { Button, Card, ErrorBox, Muted, Txt, colors, radii, styles } from "@/components/ui";
import { ApiError, type OrderDetail } from "@/lib/api";
import { callPhone } from "@/lib/navigation";
import { outbox } from "@/lib/outbox";

/** Önizlemede görüntü yerine yer tutucu gösterilecek en küçük kenar (px): ör. sahte/bozuk 1×1 görsel */
const MIN_PREVIEW_PX = 48;

/** Seçilen fotoğrafın gerçek boyutu önizlemeye yetiyor mu (yetmiyorsa düz renk blok yerine yer tutucu) */
function usePreviewable(uri: string | null) {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    if (!uri) return;
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => alive && setOk(Math.min(w, h) >= MIN_PREVIEW_PX),
      () => alive && setOk(false),
    );
    return () => {
      alive = false;
    };
  }, [uri]);
  return ok;
}

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
  const previewable = usePreviewable(photoUri);
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
    <Card style={{ gap: 10, borderColor: colors.danger, borderWidth: 2 }}>
      <Txt weight="black" size={18} style={{ letterSpacing: -0.4 }}>
        Teslim edilemedi
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }} accessibilityRole="radiogroup">
        {(Object.keys(FAILED_DELIVERY_REASONS) as FailedDeliveryReason[]).map((r) => {
          const on = reason === r;
          return (
            <Pressable
              key={r}
              onPress={() => setReason(r)}
              testID={`failed-reason-${r}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{
                borderWidth: 2,
                borderColor: on ? colors.danger : colors.border,
                backgroundColor: on ? colors.dangerLight : colors.surface,
                borderRadius: radii.pill,
                paddingHorizontal: 13,
                paddingVertical: 8,
              }}
            >
              <Txt weight={on ? "extrabold" : "bold"} size={13} color={on ? colors.danger : colors.ink}>
                {FAILED_DELIVERY_REASONS[r]}
              </Txt>
            </Pressable>
          );
        })}
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
        <Pressable
          onPress={() => setCalls((c) => c + 1)}
          testID="failed-call-plus"
          accessibilityRole="button"
          accessibilityLabel="Arama sayısını bir artır"
          style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.bg }}
        >
          <Txt testID="failed-calls" weight="extrabold">
            Arama: {calls} (+)
          </Txt>
        </Pressable>
      </View>

      {photoUri ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {previewable ? (
              <Image source={{ uri: photoUri }} style={{ width: 88, height: 88, borderRadius: radii.small }} resizeMode="cover" accessibilityLabel="Adres fotoğrafı" />
            ) : (
              // Önizlenemeyen görsel (ör. demo/bozuk dosya): düz renk blok yerine nötr yer tutucu
              <View
                accessibilityLabel="Adres fotoğrafı eklendi"
                style={{ width: 88, height: 88, borderRadius: radii.small, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="image-outline" size={30} color={colors.inactive} />
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Txt weight="extrabold" size={15}>
                ✓ Adres fotoğrafı eklendi
              </Txt>
              <Txt size={13} color={colors.muted}>
                Kanıt olarak siparişe eklenecek.
              </Txt>
            </View>
          </View>
          <Button title="Fotoğrafı yeniden çek" variant="secondary" onPress={takePhoto} testID="failed-photo" />
        </>
      ) : (
        <Pressable
          onPress={takePhoto}
          testID="failed-photo"
          accessibilityRole="button"
          accessibilityLabel="Adresin fotoğrafını çekin (zorunlu)"
          style={({ pressed }) => ({
            borderWidth: 2,
            borderStyle: "dashed",
            borderColor: colors.inactive,
            borderRadius: radii.tile,
            backgroundColor: pressed ? colors.border : colors.bg,
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          })}
        >
          <Sticker name="kamera" size={56} rotation={-6} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="extrabold" size={15}>
              Adresin fotoğrafını çekin
            </Txt>
            <Txt size={13} color={colors.muted}>
              Zorunlu · kapı, zil veya bina girişi görünsün
            </Txt>
          </View>
          <Ionicons name="camera" size={22} color={colors.ink} />
        </Pressable>
      )}

      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        placeholder="Not (ör. kapı kilitli, telefon kapalı)"
        placeholderTextColor={colors.muted}
        multiline
        testID="failed-note"
      />
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
