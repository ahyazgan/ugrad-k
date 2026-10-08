import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, Text } from "react-native";
import { SignaturePad } from "@/components/SignaturePad";
import { BigTitle } from "@/components/Neo";
import { Button, Card, ErrorBox, Field, Muted, Screen, radii, type } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { setActiveOrderForLocation } from "@/lib/location";

export default function Teslim() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [receiver, setReceiver] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        pod: { photoUri, signatureSvg: signature, receiverName: receiver.trim() },
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
      <BigTitle size={52}>Teslim et.</BigTitle>
      <Card>
        <Field label="Teslim alan kişi" placeholder="Ad Soyad / unvan" value={receiver} onChangeText={setReceiver} testID="receiver" />
      </Card>
      <Card>
        <Text style={type.label}>1 · FOTOĞRAF</Text>
        <Muted>Paketin teslim edildiği yerin / kişinin fotoğrafı</Muted>
        {photoUri ? <Image source={{ uri: photoUri }} style={{ width: "100%", height: 200, borderRadius: radii.tile }} resizeMode="cover" /> : null}
        <Button title={photoUri ? "Yeniden çek" : "Fotoğraf çek"} variant="secondary" onPress={takePhoto} />
      </Card>
      <Card>
        <Text style={type.label}>2 · İMZA</Text>
        <SignaturePad onChange={setSignature} />
      </Card>
      <ErrorBox message={error} />
      <Button
        title="Teslimi tamamla"
        onPress={submit}
        loading={busy}
        disabled={receiver.trim().length < 2 || (!photoUri && !signature)}
        testID="complete-delivery"
      />
      <Muted style={{ textAlign: "center" }}>Fotoğraf veya imzadan en az biri zorunludur.</Muted>
    </Screen>
  );
}
