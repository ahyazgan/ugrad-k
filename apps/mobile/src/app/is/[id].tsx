import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { FailedDeliveryForm } from "@/components/FailedDelivery";
import { OfferCard } from "@/components/OfferCard";
import { StatusBadge } from "@/components/StatusBadge";
import { TileMap, type MapMarker } from "@/components/TileMap";
import { Button, Card, ErrorBox, Loading, Muted, Screen, Title, colors, styles } from "@/components/ui";
import { api, ApiError, type OrderDetail } from "@/lib/api";
import { OutboxBanner } from "@/components/OutboxBanner";
import { formatTime } from "@/lib/format";
import { outbox } from "@/lib/outbox";
import { currentPosition, lastKnownPosition, setActiveOrderForLocation } from "@/lib/location";
import { callPhone, openDirections } from "@/lib/navigation";

function Stop({
  title,
  address,
  details,
  contactName,
  contactPhone,
  lat,
  lng,
}: {
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
      <Muted>{title}</Muted>
      <Text style={{ fontWeight: "700", fontSize: 16 }}>{address}</Text>
      {details ? <Text>{details}</Text> : null}
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
  const [failing, setFailing] = useState(false);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // Ölçülen bekleme süresi canlı güncellenir
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

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

  const [queuedMsg, setQueuedMsg] = useState<string | null>(null);

  async function act(action: Parameters<typeof api.courierAction>[1]) {
    if (!order) return;
    setBusy(true);
    setError(null);
    setQueuedMsg(null);
    try {
      if (action.type === "release") {
        // İşi bırakmak sunucu kararı gerektirir (bağlantı şart)
        await api.courierAction(id, action);
        router.back();
        return;
      }
      // Paketi aldım / yola çıktım / sorun: bağlantı yoksa telefonda sıraya alınır
      const base = { orderId: id, orderNo: order.orderNo };
      const r = await outbox.run([
        { kind: "action", ...base, action, fileStamp: Date.now() },
        ...(action.type === "pickup" ? [{ kind: "reprice" as const, ...base }] : []),
      ]);
      if (action.type === "on_the_way" || action.type === "pickup") setActiveOrderForLocation(id);
      setNoteFor(null);
      setNote("");
      if (r === "queued") {
        // Ekran akmaya devam etsin: durum yerelde ilerler, sunucuya sonra gider
        const next: Partial<Record<typeof action.type, OrderDetail["status"]>> = { pickup: "alindi", on_the_way: "yolda", problem: "sorunlu" };
        setOrder({ ...order, status: next[action.type] ?? order.status });
        setQueuedMsg("Bağlantı yok: işlem kaydedildi, bağlantı gelince yapıldığı saatle gönderilecek.");
      } else await load();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "İşlem başarısız");
    } finally {
      setBusy(false);
    }
  }

  async function arrive(stop: "alis" | "teslim") {
    if (!order) return;
    setBusy(true);
    setError(null);
    setQueuedMsg(null);
    try {
      const r = await outbox.run([{ kind: "arrive", orderId: id, orderNo: order.orderNo, stop, loc: await currentPosition() }]);
      setNow(Date.now());
      if (r === "queued") {
        const at = new Date().toISOString();
        setOrder({ ...order, ...(stop === "alis" ? { arrivedPickupAt: at } : { arrivedDropoffAt: at }) });
        setQueuedMsg("Bağlantı yok: varış kaydedildi, bağlantı gelince gönderilecek.");
      } else await load();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Varış bildirilemedi");
    } finally {
      setBusy(false);
    }
  }

  if (!order) return error ? <Screen><ErrorBox message={error} /></Screen> : <Loading />;
  const s = order.status;
  const offerPending = !!order.offerExpiresAt;
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
        {order.packageDescription ? <Text>📦 {order.packageDescription}{order.weightKg ? ` · ${order.weightKg} kg` : ""}</Text> : null}
        {order.customerNote ? <Text style={{ color: colors.primary }}>Not: {order.customerNote}</Text> : null}
        {order.roundTrip ? <Text style={{ fontWeight: "700" }}>↩ Gidiş-dönüş: teslimden sonra alış adresine geri dönülecek</Text> : null}
        {order.paymentMethod === "nakit" ? (
          <Text style={{ fontWeight: "700", color: colors.danger }}>
            Tahsilat: {(order.totalKurus / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL (nakit / IBAN)
          </Text>
        ) : null}
      </Card>

      {s !== "teslim_edildi" && s !== "iptal" && s !== "geri_teslim" ? <JobMap order={order} /> : null}
      {!offerPending && ["kuryeye_atandi", "alindi", "yolda", "sorunlu", "geri_donuyor"].includes(s) ? (
        <Button
          title="Müşteriye yaz"
          variant="secondary"
          onPress={() => router.push({ pathname: "/mesajlar/[id]", params: { id, role: "kurye" } })}
          testID="open-chat"
        />
      ) : null}

      <Stop
        title="1 · ALIŞ"
        address={order.pickupAddress}
        details={order.pickupDetails}
        contactName={order.pickupContactName}
        contactPhone={order.pickupContactPhone}
        lat={order.pickupLat}
        lng={order.pickupLng}
      />
      <Stop
        title="2 · TESLİM"
        address={order.dropoffAddress}
        details={order.dropoffDetails}
        contactName={order.dropoffContactName}
        contactPhone={order.dropoffContactPhone}
        lat={order.dropoffLat}
        lng={order.dropoffLng}
      />

      <ErrorBox message={error} />
      {queuedMsg ? <Muted style={{ color: "#92400E" }}>{queuedMsg}</Muted> : null}
      <OutboxBanner onSent={load} />

      {offerPending ? (
        <OfferCard
          job={{ ...order, offerExpiresAt: order.offerExpiresAt! }}
          me={null}
          onDone={(m) => {
            if (m) setError(m);
            api.getOrder(id).then((o) => (o.offerExpiresAt || o.status !== "kuryeye_atandi" ? router.back() : setOrder(o)), () => router.back());
          }}
        />
      ) : null}

      {s === "kuryeye_atandi" && !offerPending ? (
        <Card>
          {order.arrivedPickupAt ? (
            <>
              <Text style={{ fontWeight: "600" }}>Alış adresine vardınız · {formatTime(order.arrivedPickupAt)}</Text>
              <Text testID="waiting-measured" style={{ fontSize: 16, fontWeight: "700" }}>
                Bekleme: {Math.max(0, Math.floor((now - new Date(order.arrivedPickupAt).getTime()) / 60_000))} dk
              </Text>
              <Muted>Süre otomatik ölçülür. İlk 15 dakika ücretsiz; sonrası müşteriye yansıtılır.</Muted>
            </>
          ) : (
            <>
              <Button title="Alış adresine vardım" variant="secondary" onPress={() => arrive("alis")} loading={busy} testID="arrive-pickup" />
              <Muted>Adrese yaklaşınca otomatik işaretlenir; gönderene &quot;kurye kapıda&quot; mesajı gider ve bekleme süresi ölçülür.</Muted>
              <Text style={{ fontWeight: "600" }}>Alışta bekleme süresi (dakika)</Text>
              <TextInput style={styles.input} keyboardType="number-pad" value={waiting} onChangeText={setWaiting} testID="waiting" />
            </>
          )}
          <Button title="Paketi aldım" onPress={() => act({ type: "pickup", waitingMinutes: waitingNum })} loading={busy} testID="pickup" />
        </Card>
      ) : null}
      {s === "alindi" ? <Button title="Yola çıktım" onPress={() => act({ type: "on_the_way" })} loading={busy} testID="on-the-way" /> : null}
      {(s === "yolda" || s === "sorunlu") && !order.arrivedDropoffAt ? (
        <Button title="Teslim adresine vardım" variant="secondary" onPress={() => arrive("teslim")} loading={busy} testID="arrive-dropoff" />
      ) : null}
      {(s === "yolda" || s === "sorunlu") && order.arrivedDropoffAt ? (
        <Muted>Teslim adresine vardınız · {formatTime(order.arrivedDropoffAt)} (alıcıya &quot;kurye kapıda&quot; mesajı gitti)</Muted>
      ) : null}
      {s === "geri_donuyor" ? (
        <Card style={{ gap: 8, borderColor: "#9A3412" }}>
          <Text style={{ fontWeight: "700", fontSize: 16 }}>Paketi göndericiye geri götürün</Text>
          <Muted>Alış adresine dönün ve paketi göndericiye teslim edin (fotoğraf veya imza).</Muted>
          <Button title="Yol tarifi (alış)" variant="secondary" onPress={() => openDirections(order.pickupLat, order.pickupLng, order.pickupAddress)} />
          <Button
            title="Göndericiye teslim et"
            onPress={() => router.push({ pathname: "/teslim/[id]", params: { id, mode: "iade" } })}
            testID="return-deliver"
          />
        </Card>
      ) : null}
      {(s === "yolda" || s === "sorunlu") && failing ? (
        <FailedDeliveryForm
          order={order}
          now={now}
          onCancel={() => setFailing(false)}
          onDone={(queued) => {
            setFailing(false);
            if (queued) {
              setOrder({ ...order, status: "geri_donuyor", failedAt: new Date().toISOString() });
              setQueuedMsg("Bağlantı yok: teslim edilemedi kaydı ve fotoğraf telefonda bekliyor, bağlantı gelince gönderilecek.");
            } else load();
          }}
        />
      ) : null}
      {(s === "yolda" || s === "sorunlu") && !failing ? (
        <Button
          title="Teslim et"
          onPress={() => router.push({ pathname: "/teslim/[id]", params: { id } })}
          disabled={busy}
          testID="deliver"
        />
      ) : null}

      {(s === "yolda" || s === "sorunlu") && !failing && !noteFor ? (
        <Button title="Teslim edilemedi" variant="secondary" onPress={() => setFailing(true)} testID="failed-open" />
      ) : null}
      {["kuryeye_atandi", "alindi", "yolda"].includes(s) && !noteFor && !offerPending && !failing ? (
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
          <Text style={{ fontWeight: "600" }}>{noteFor === "problem" ? "Sorunu açıklayın" : "Neden bırakıyorsunuz?"}</Text>
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
