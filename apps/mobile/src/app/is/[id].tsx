import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { StatusBadge } from "@/components/StatusBadge";
import { Sticker, type StickerName } from "@/components/Sticker";
import { TileMap, type MapMarker } from "@/components/TileMap";
import { Button, Card, ErrorBox, Loading, Muted, Screen, Title, colors, styles, font } from "@/components/ui";
import { api, ApiError, type OrderDetail } from "@/lib/api";
import { lastKnownPosition, setActiveOrderForLocation } from "@/lib/location";
import { callPhone, openDirections } from "@/lib/navigation";

function Stop({
  sticker,
  title,
  address,
  details,
  contactName,
  contactPhone,
  lat,
  lng,
}: {
  sticker: StickerName;
  title: string;
  address: string;
  details: string | null;
  contactName: string | null;
  contactPhone: string | null;
  lat: number;
  lng: number;
}) {
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Muted>{title}</Muted>
        <Sticker name={sticker} size={40} rotation={sticker === "pin" ? 8 : -6} style={{ marginTop: -18, marginBottom: -6 }} />
      </View>
      <Text style={{ ...font("extrabold"), fontSize: 16 }}>{address}</Text>
      {details ? <Text style={styles.body}>{details}</Text> : null}
      {contactName || contactPhone ? <Muted>{[contactName, contactPhone].filter(Boolean).join(" · ")}</Muted> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title="Yol tarifi" variant="secondary" onPress={() => openDirections(lat, lng, address)} />
        </View>
        {contactPhone ? (
          <View style={{ flex: 1 }}>
            <Button title="Ara" variant="secondary" onPress={() => callPhone(contactPhone)} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/** Alış → teslim güzergâhı ve kuryenin kendi konumu */
function JobMap({ order }: { order: OrderDetail }) {
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = () => lastKnownPosition().then((p) => alive && setMe(p));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const markers: MapMarker[] = [
    { kind: "pickup", lat: order.pickupLat, lng: order.pickupLng },
    { kind: "dropoff", lat: order.dropoffLat, lng: order.dropoffLng },
    ...(me ? [{ kind: "courier" as const, ...me }] : []),
  ];
  return (
    <Card>
      <TileMap markers={markers} height={200} />
      <Muted>
        A: alış · T: teslim
        {me ? " · 🛵 siz" : ""}
      </Muted>
    </Card>
  );
}

export default function IsDetay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState("0");
  const [noteFor, setNoteFor] = useState<"problem" | "release" | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setOrder(await api.getOrder(id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Yüklenemedi");
    }
  }, [id]);

  useEffect(() => {
    api.getOrder(id).then(setOrder, (e) => setError(e instanceof ApiError ? e.message : "Yüklenemedi"));
    return api.subscribeOrder(id, load);
  }, [id, load]);

  async function act(action: Parameters<typeof api.courierAction>[1]) {
    setBusy(true);
    setError(null);
    try {
      await api.courierAction(id, action);
      if (action.type === "on_the_way" || action.type === "pickup") setActiveOrderForLocation(id);
      if (action.type === "release") {
        router.back();
        return;
      }
      setNoteFor(null);
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İşlem başarısız");
    } finally {
      setBusy(false);
    }
  }

  if (!order) return error ? <Screen><ErrorBox message={error} /></Screen> : <Loading />;
  const s = order.status;
  const waitingNum = Math.max(0, parseInt(waiting || "0", 10) || 0);

  return (
    <Screen>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Title>
            {order.orderNo}
            {order.urgent ? " ⚡" : ""}
          </Title>
          <StatusBadge status={s} />
        </View>
        {order.packageDescription ? <Text style={styles.body}>📦 {order.packageDescription}{order.weightKg ? ` · ${order.weightKg} kg` : ""}</Text> : null}
        {order.customerNote ? <Text style={{ ...font("extrabold"), color: colors.ink }}>Not: {order.customerNote}</Text> : null}
        {order.roundTrip ? <Text style={{ ...font("extrabold") }}>↩ Gidiş-dönüş: teslimden sonra alış adresine geri dönülecek</Text> : null}
        {order.paymentMethod === "nakit" ? (
          <Text style={{ ...font("extrabold"), color: colors.danger }}>
            Tahsilat: {(order.totalKurus / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL (nakit / IBAN)
          </Text>
        ) : null}
      </Card>

      {s !== "teslim_edildi" && s !== "iptal" ? <JobMap order={order} /> : null}

      <Stop
        sticker="kutu"
        title="1 · ALIŞ"
        address={order.pickupAddress}
        details={order.pickupDetails}
        contactName={order.pickupContactName}
        contactPhone={order.pickupContactPhone}
        lat={order.pickupLat}
        lng={order.pickupLng}
      />
      <Stop
        sticker="pin"
        title="2 · TESLİM"
        address={order.dropoffAddress}
        details={order.dropoffDetails}
        contactName={order.dropoffContactName}
        contactPhone={order.dropoffContactPhone}
        lat={order.dropoffLat}
        lng={order.dropoffLng}
      />

      <ErrorBox message={error} />

      {s === "kuryeye_atandi" ? (
        <Card>
          <Text style={{ ...font("bold") }}>Alışta bekleme süresi (dakika)</Text>
          <Muted>İlk 15 dakika ücretsiz; sonrası müşteriye yansıtılır.</Muted>
          <TextInput style={styles.input} keyboardType="number-pad" value={waiting} onChangeText={setWaiting} testID="waiting" />
          <Button title="Paketi aldım" onPress={() => act({ type: "pickup", waitingMinutes: waitingNum })} loading={busy} testID="pickup" />
        </Card>
      ) : null}
      {s === "alindi" ? <Button title="Yola çıktım" onPress={() => act({ type: "on_the_way" })} loading={busy} testID="on-the-way" /> : null}
      {s === "yolda" || s === "sorunlu" ? (
        <Button
          title="Teslim et"
          onPress={() => router.push({ pathname: "/teslim/[id]", params: { id } })}
          disabled={busy}
          testID="deliver"
        />
      ) : null}

      {["kuryeye_atandi", "alindi", "yolda"].includes(s) && !noteFor ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button title="Sorun bildir" variant="secondary" onPress={() => setNoteFor("problem")} />
          </View>
          {s === "kuryeye_atandi" ? (
            <View style={{ flex: 1 }}>
              <Button title="İşi bırak" variant="secondary" onPress={() => setNoteFor("release")} />
            </View>
          ) : null}
        </View>
      ) : null}
      {noteFor ? (
        <Card>
          <Text style={{ ...font("bold") }}>{noteFor === "problem" ? "Sorunu açıklayın" : "Neden bırakıyorsunuz?"}</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Örn. alıcıya ulaşılamıyor" multiline />
          <Button
            title="Gönder"
            variant="danger"
            disabled={note.trim().length < 3}
            loading={busy}
            onPress={() => act(noteFor === "problem" ? { type: "problem", note: note.trim() } : { type: "release", note: note.trim() })}
          />
          <Button title="Vazgeç" variant="secondary" onPress={() => setNoteFor(null)} />
        </Card>
      ) : null}
    </Screen>
  );
}
