import { ORDER_STATUS_LABELS, ageLabel, formatTL, type OrderStatus } from "@yazgan/shared";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Share, Text, TextInput, View } from "react-native";
import { StatusBadge } from "@/components/StatusBadge";
import { TileMap, type MapMarker } from "@/components/TileMap";
import { Button, Card, ErrorBox, Loading, Muted, Row, Screen, Title, colors, styles } from "@/components/ui";
import { api, ApiError, type CourierPosition, type OrderDetail } from "@/lib/api";
import { formatDateTime, formatTime } from "@/lib/format";
import { payOrder } from "@/lib/payment";

const TRACKING_BASE = process.env.EXPO_PUBLIC_TRACKING_BASE_URL ?? "https://panel.yazgankurye.com/takip";
const trackingUrl = (token: string) => `${TRACKING_BASE.replace(/\/$/, "")}/${token}`;

const PAYMENT_LABEL: Record<string, string> = {
  odenmedi: "Ödeme bekleniyor",
  odendi: "Ödendi (kart)",
  iade_edildi: "Ödeme iade edildi",
  iade_bekliyor: "İade işleniyor",
  cari_hesap: "Cari hesaba işlendi",
};

const STEPS: OrderStatus[] = ["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda", "teslim_edildi"];

function Timeline({ order }: { order: OrderDetail }) {
  const reached = new Map(order.history.map((h) => [h.status, h.at]));
  const steps = order.status === "iptal" || order.status === "sorunlu" ? [...STEPS.filter((s) => reached.has(s)), order.status] : STEPS;
  return (
    <View style={{ gap: 10 }}>
      {steps.map((s) => {
        const at = reached.get(s);
        const current = s === order.status;
        return (
          <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: at ? (current ? colors.accent : colors.primary) : colors.border,
              }}
            />
            <Text style={{ flex: 1, fontWeight: current ? "700" : "400", color: at ? colors.text : colors.muted }}>
              {ORDER_STATUS_LABELS[s]}
            </Text>
            {at ? <Muted>{formatTime(at)}</Muted> : null}
          </View>
        );
      })}
    </View>
  );
}

const LIVE: OrderStatus[] = ["kuryeye_atandi", "alindi", "yolda"];

/** Alış/teslim noktaları ve (teslimat sürerken) kuryenin canlı konumu */
function OrderMap({ order }: { order: OrderDetail }) {
  const live = LIVE.includes(order.status);
  const [pos, setPos] = useState<CourierPosition | null>(null);
  useEffect(() => (live ? api.watchCourierLocation(order.id, setPos) : undefined), [order.id, live]);
  const courier = live ? pos : null;
  const markers: MapMarker[] = [
    ...(order.status === "yolda" ? [] : [{ kind: "pickup" as const, lat: order.pickupLat, lng: order.pickupLng }]),
    { kind: "dropoff", lat: order.dropoffLat, lng: order.dropoffLng },
    ...(courier ? [{ kind: "courier" as const, lat: courier.lat, lng: courier.lng }] : []),
  ];
  return (
    <Card>
      <TileMap markers={markers} route={!courier} />
      <Muted>
        {courier
          ? `🛵 Kurye konumu · ${ageLabel(courier.recordedAt)}`
          : live
            ? "Kurye konumu bekleniyor…"
            : "A: alış · T: teslim noktası"}
      </Muted>
    </Card>
  );
}

export default function SiparisDetay() {
  const { id, yeni } = useLocalSearchParams<{ id: string; yeni?: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await api.getOrder(id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sipariş yüklenemedi");
    }
  }, [id]);

  useEffect(() => {
    api.getOrder(id).then(setOrder, (e) => setError(e instanceof ApiError ? e.message : "Sipariş yüklenemedi"));
    return api.subscribeOrder(id, load);
  }, [id, load]);

  async function cancel() {
    setBusy(true);
    try {
      await api.cancelOrder(id, reason.trim());
      setCancelOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İptal edilemedi");
    } finally {
      setBusy(false);
    }
  }

  if (!order) return error ? <Screen><ErrorBox message={error} /></Screen> : <Loading />;
  const cancellable = order.status === "beklemede" || order.status === "onaylandi";

  return (
    <Screen>
      {yeni ? (
        <Card style={{ backgroundColor: colors.successLight, borderColor: colors.success }}>
          <Text style={{ fontWeight: "700", color: colors.success }}>Siparişiniz alındı 🎉</Text>
          <Muted>Durum değiştikçe bu ekran kendiliğinden güncellenir.</Muted>
        </Card>
      ) : null}
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Title>{order.orderNo}</Title>
          <StatusBadge status={order.status} />
        </View>
        <Muted>{formatDateTime(order.createdAt)}</Muted>
        <Timeline order={order} />
      </Card>

      {!["teslim_edildi", "iptal"].includes(order.status) ? <OrderMap order={order} /> : null}

      {!["teslim_edildi", "iptal"].includes(order.status) ? (
        <Button
          title="Takip linkini paylaş"
          variant="secondary"
          onPress={() =>
            Share.share({
              message: `${order.orderNo} gönderisini canlı takip edin: ${trackingUrl(order.trackingToken)}`,
            })
          }
        />
      ) : null}

      {order.courierName ? (
        <Card>
          <Text style={{ fontWeight: "700" }}>Kuryeniz: {order.courierName}</Text>
          {order.courierPhone ? (
            <Button title="Kuryeyi ara" variant="secondary" onPress={() => Linking.openURL(`tel:${order.courierPhone}`)} />
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Muted>Nereden</Muted>
        <Text style={{ fontWeight: "600" }}>{order.pickupAddress}</Text>
        {order.pickupDetails ? <Muted>{order.pickupDetails}</Muted> : null}
        <Muted>Nereye</Muted>
        <Text style={{ fontWeight: "600" }}>{order.dropoffAddress}</Text>
        {order.dropoffDetails ? <Muted>{order.dropoffDetails}</Muted> : null}
        {order.packageDescription ? <Muted>Paket: {order.packageDescription}</Muted> : null}
      </Card>

      <Card>
        {order.priceQuote.lines.map((l) => (
          <Row key={l.code} label={l.label} value={formatTL(l.amountKurus)} />
        ))}
        <Row label="KDV" value={formatTL(order.priceQuote.vatKurus)} />
        <Row label="Toplam" value={formatTL(order.totalKurus)} bold />
        <Muted>
          {order.paymentMethod === "nakit" && order.paymentStatus === "odenmedi"
            ? "Teslimatta kuryeye ödenecek"
            : (PAYMENT_LABEL[order.paymentStatus] ?? order.paymentStatus)}
        </Muted>
        {order.paymentMethod === "kart" && order.paidKurus != null && order.totalKurus > order.paidKurus ? (
          <Muted>Bekleme ücreti farkı ({formatTL(order.totalKurus - order.paidKurus)}) ayrıca tahsil edilecek.</Muted>
        ) : null}
      </Card>

      {order.paymentMethod === "kart" && order.paymentStatus === "odenmedi" && order.status !== "iptal" ? (
        <Muted style={{ textAlign: "center" }}>Ödemesi tamamlanmayan siparişler kısa süre sonra otomatik iptal edilir.</Muted>
      ) : null}
      {order.paymentMethod === "kart" && order.paymentStatus === "odenmedi" && order.status !== "iptal" ? (
        <Button
          title="Ödemeyi tamamla"
          testID="pay"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await payOrder(order.id);
              await load();
            } catch (e) {
              setError(e instanceof ApiError ? e.message : "Ödeme başlatılamadı");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}

      {order.invoicePdfUrl ? (
        <Button title="Faturayı görüntüle" variant="secondary" onPress={() => Linking.openURL(order.invoicePdfUrl!)} />
      ) : null}
      <ErrorBox message={error} />
      {order.cancelReason ? <Muted>İptal nedeni: {order.cancelReason}</Muted> : null}

      {cancellable && !cancelOpen ? <Button title="Siparişi iptal et" variant="secondary" onPress={() => setCancelOpen(true)} /> : null}
      {cancelOpen ? (
        <Card>
          <Text style={{ fontWeight: "600" }}>İptal nedeni</Text>
          <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Kısaca yazın" />
          <Button title="İptal et" variant="danger" onPress={cancel} loading={busy} disabled={reason.trim().length < 3} />
          <Button title="Vazgeç" variant="secondary" onPress={() => setCancelOpen(false)} />
        </Card>
      ) : null}
    </Screen>
  );
}
