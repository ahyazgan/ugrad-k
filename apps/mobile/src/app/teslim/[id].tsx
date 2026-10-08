import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { formatTL } from "@yazgan/shared";
import { useEffect, useState } from "react";
import { Image, Text } from "react-native";
import { SignaturePad } from "@/components/SignaturePad";
import { Button, Card, ErrorBox, Field, Muted, Screen, Segmented } from "@/components/ui";
import { api, ApiError, type CashCollection, type OrderDetail } from "@/lib/api";
import { setActiveOrderForLocation } from "@/lib/location";

export default function Teslim() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [receiver, setReceiver] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [collection, setCollection] = useState<CashCollection | "">("");

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

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.courierAction(id, {
        type: "deliver",
        pod: { photoUri, signatureSvg: signature, receiverName: receiver.trim(), cashCollection: needsCash ? (collection as CashCollection) : null },
      });
      setActiveOrderForLocation(null);
      router.dismissTo("/(kurye)");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Teslim kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Field label="Teslim alan kişi" placeholder="Ad Soyad / unvan" value={receiver} onChangeText={setReceiver} testID="receiver" />
      </Card>
      <Card>
        <Text style={{ fontWeight: "600" }}>Fotoğraf</Text>
        <Muted>Paketin teslim edildiği yerin / kişinin fotoğrafı</Muted>
        {photoUri ? <Image source={{ uri: photoUri }} style={{ width: "100%", height: 200, borderRadius: 10 }} resizeMode="cover" /> : null}
        <Button title={photoUri ? "Yeniden çek" : "Fotoğraf çek"} variant="secondary" onPress={takePhoto} />
      </Card>
      <Card>
        <Text style={{ fontWeight: "600" }}>İmza</Text>
        <SignaturePad onChange={setSignature} />
      </Card>
      {needsCash ? (
        <Card>
          <Text style={{ fontWeight: "600" }}>Tahsilat: {formatTL(order.totalKurus)}</Text>
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
        title="Teslimi tamamla"
        onPress={submit}
        loading={busy}
        disabled={receiver.trim().length < 2 || (!photoUri && !signature) || (needsCash && !collection)}
        testID="complete-delivery"
      />
      <Muted style={{ textAlign: "center" }}>Fotoğraf veya imzadan en az biri zorunludur.</Muted>
    </Screen>
  );
}
