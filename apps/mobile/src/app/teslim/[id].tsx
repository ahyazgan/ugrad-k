import * as ImagePicker from "expo-image-picker";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { formatTL } from "@yazgan/shared";
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { SignaturePad } from "@/components/SignaturePad";
import { BigTitle } from "@/components/Neo";
import { Sticker } from "@/components/Sticker";
import { Button, Card, ErrorBox, Field, Muted, Screen, Segmented, colors, font, radii, type } from "@/components/ui";
import { api, ApiError, type CashCollection, type OrderDetail } from "@/lib/api";
import { setActiveOrderForLocation } from "@/lib/location";
import { outbox } from "@/lib/outbox";

export default function Teslim() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  // Teslim edilemeyen paketin göndericiye iadesi: kod sorulmaz, kanıt ayrı kaydedilir
  const returning = mode === "iade";
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [receiver, setReceiver] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [collection, setCollection] = useState<CashCollection | "">("");
  const [code, setCode] = useState("");
  const [codeOk, setCodeOk] = useState(false);
  const [codeMsg, setCodeMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getOrder(id).then(setOrder, () => undefined);
  }, [id]);
  // Kuryeye ödemeli ve henüz ödenmemiş: tahsilat şekli zorunlu
  const needsCash = order?.paymentMethod === "nakit" && order.paymentStatus !== "odendi";

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

  const needsCode = !returning && !!order?.deliveryCodeRequired && !codeOk;

  async function verifyCode() {
    setCodeMsg(null);
    try {
      const r = await api.verifyDeliveryCode(id, code);
      setCodeOk(r.ok);
      setCodeMsg(r.ok ? "Kod doğru" : `Kod yanlış, ${r.remaining} hakkınız kaldı`);
    } catch (e) {
      setCodeMsg(e instanceof ApiError ? e.message : "Kod doğrulanamadı");
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // Bağlantı yoksa kanıtla birlikte telefonda sıraya alınır, teslim saati korunur
      await outbox.run([
        {
          kind: "action",
          orderId: id,
          orderNo: order?.orderNo ?? "",
          fileStamp: Date.now(),
          action: {
            type: returning ? "return_deliver" : "deliver",
            pod: { photoUri, signatureSvg: signature, receiverName: receiver.trim(), cashCollection: needsCash ? (collection as CashCollection) : null },
          },
        },
      ]);
      setActiveOrderForLocation(null);
      router.dismissTo("/(kurye)");
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Teslim kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {returning ? <Stack.Screen options={{ title: "Göndericiye teslim" }} /> : null}
      <BigTitle size={52}>{returning ? "İade et." : "Teslim et."}</BigTitle>
      {returning ? (
        <Card style={{ borderColor: "#9A3412" }}>
          <Text style={{ ...font("extrabold") }}>Teslim edilemeyen paket göndericiye iade ediliyor</Text>
          <Muted>Paketi alış adresindeki yetkiliye teslim edin; fotoğraf veya imza alın.</Muted>
        </Card>
      ) : null}
      <Card>
        <Field label={returning ? "Paketi geri alan kişi" : "Teslim alan kişi"} placeholder="Ad Soyad / unvan" value={receiver} onChangeText={setReceiver} testID="receiver" />
      </Card>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={type.label}>1 · FOTOĞRAF</Text>
          <Sticker name="kamera" size={56} rotation={8} style={{ marginTop: -18, marginBottom: -8 }} />
        </View>
        <Muted>Paketin teslim edildiği yerin / kişinin fotoğrafı</Muted>
        {photoUri ? <Image source={{ uri: photoUri }} style={{ width: "100%", height: 200, borderRadius: radii.tile }} resizeMode="cover" /> : null}
        <Button title={photoUri ? "Yeniden çek" : "Fotoğraf çek"} variant="secondary" onPress={takePhoto} />
      </Card>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={type.label}>2 · İMZA</Text>
          <Sticker name="imza" size={56} rotation={-8} style={{ marginTop: -22, marginBottom: -8 }} />
        </View>
        <SignaturePad onChange={setSignature} />
      </Card>
      {order?.deliveryCodeRequired && !returning ? (
        <Card>
          <Text style={type.label}>3 · TESLİM KODU</Text>
          <Muted>Alıcıdan SMS ile gelen 4 haneli kodu isteyin.</Muted>
          <Field label="Kod" keyboardType="number-pad" maxLength={4} value={code} onChangeText={setCode} editable={!codeOk} testID="delivery-code-input" />
          {codeOk ? null : <Button title="Kodu doğrula" variant="secondary" onPress={verifyCode} disabled={code.trim().length !== 4} testID="verify-code" />}
          {codeMsg ? <Muted style={{ color: codeOk ? colors.success : colors.danger }}>{codeMsg}</Muted> : null}
        </Card>
      ) : null}
      {needsCash ? (
        <Card>
          <Text style={{ ...font("extrabold"), fontSize: 16 }}>Tahsilat: {formatTL(order.totalKurus)}</Text>
          <Muted>Müşteriden ödemeyi nasıl aldınız? Nakit aldıysanız hakedişinizden düşülür.</Muted>
          <Segmented
            testIDPrefix="cash"
            value={collection}
            onChange={setCollection}
            options={[
              { value: "nakit", label: "Nakit aldım" },
              { value: "iban", label: "IBAN'a gönderdi" },
              { value: "alinmadi", label: "Alınamadı" },
            ]}
          />
        </Card>
      ) : null}
      <ErrorBox message={error} />
      <Button
        title={returning ? "İadeyi tamamla" : "Teslimi tamamla"}
        onPress={submit}
        loading={busy}
        disabled={receiver.trim().length < 2 || (!photoUri && !signature) || (needsCash && !collection) || needsCode}
        testID="complete-delivery"
      />
      <Muted style={{ textAlign: "center" }}>Fotoğraf veya imzadan en az biri zorunludur.</Muted>
    </Screen>
  );
}
