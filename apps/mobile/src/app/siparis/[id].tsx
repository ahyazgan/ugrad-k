import { FAILED_DELIVERY_REASONS, ORDER_STATUS_LABELS, ageLabel, etaAt, formatTL, istanbulTime, slaState, trackingBaseUrl, type OrderStatus } from "@yazgan/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, Share, Text, TextInput, View } from "react-native";
import { StatusBadge } from "@/components/StatusBadge";
import { Sticker } from "@/components/Sticker";
import { TileMap, type MapMarker } from "@/components/TileMap";
import { Button, Card, ErrorBox, Loading, Muted, Row, Screen, Title, colors, styles, font } from "@/components/ui";
import { api, ApiError, type CourierPosition, type OrderDetail } from "@/lib/api";
import { formatDateTime, formatTime } from "@/lib/format";
import { payOrder } from "@/lib/payment";

const TRACKING_BASE = process.env.EXPO_PUBLIC_TRACKING_BASE_URL ?? trackingBaseUrl;
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
  const steps =
    order.status === "iptal" || order.status === "sorunlu"
      ? [...STEPS.filter((s) => reached.has(s)), order.status]
      : order.status === "geri_donuyor" || order.status === "geri_teslim"
        ? [...STEPS.filter((s) => reached.has(s) && s !== "teslim_edildi"), "geri_donuyor" as const, "geri_teslim" as const]
        : STEPS;
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
            <Text style={{ flex: 1, ...font(current ? "extrabold" : "semibold"), color: at ? colors.text : colors.muted }}>
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
  const active = !["teslim_edildi", "iptal", "sorunlu", "geri_donuyor", "geri_teslim"].includes(order.status);
  const eta = active
    ? etaAt(
        {
          status: order.status,
          pickup: { lat: order.pickupLat, lng: order.pickupLng },
          dropoff: { lat: order.dropoffLat, lng: order.dropoffLng },
          durationSeconds: order.durationSeconds,
        },
        courier,
      )
    : null;
  const sla = slaState({ slaDueAt: order.slaDueAt, deliveredAt: null, status: order.status }, eta);
  return (
    <Card>
      {eta ? (
        <Text style={{ ...font("extrabold"), fontSize: 16, color: colors.text }} testID="eta">
          Tahmini teslim: {istanbulTime(eta)}
        </Text>
      ) : null}
      {order.slaDueAt && active ? (
        <Muted style={sla === "riskli" || sla === "gecikti" ? { color: "#B45309", ...font("bold") } : undefined}>
          Acil teslim taahhüdü: {istanbulTime(order.slaDueAt)}
          {sla === "riskli" || sla === "gecikti" ? " · gecikme olursa acil ek ücreti sonraki siparişinizden düşülür" : ""}
        </Muted>
      ) : null}
      <TileMap markers={markers} route={!courier} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Muted style={{ flex: 1 }}>
          {courier
            ? `🛵 Kurye konumu · ${ageLabel(courier.recordedAt)}`
            : live
              ? "Kurye konumu bekleniyor…"
              : "A: alış · T: teslim noktası"}
        </Muted>
        <Sticker name="pin" size={40} rotation={-8} style={{ marginBottom: -8 }} />
        <Sticker name="motor" size={76} rotation={4} style={{ marginBottom: -12 }} />
      </View>
    </Card>
  );
}

/** Teslim sonrası 1–5 yıldız değerlendirme; 5 puanda Google yorum daveti */
function RateCard({ order, onRated }: { order: OrderDetail; onRated: () => void }) {
  const [score, setScore] = useState(order.rating ?? 0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [google, setGoogle] = useState<string | null>(null);
  const done = order.rating != null || google !== null;

  if (done) {
    return (
      <Card>
        <Text style={{ ...font("extrabold") }} testID="rating-thanks">
          Değerlendirmeniz için teşekkürler <Text style={{ color: colors.star }}>{"★".repeat(order.rating ?? score)}</Text>
        </Text>
        {google ? <Button title="Google'da yorum yazın" variant="secondary" onPress={() => Linking.openURL(google)} /> : null}
      </Card>
    );
  }
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ ...font("extrabold"), flex: 1 }}>Teslimatı nasıl buldunuz?</Text>
        <Sticker name="yildiz" size={48} rotation={10} style={{ marginVertical: -12 }} />
      </View>
      <View style={{ flexDirection: "row", gap: 6 }} accessibilityRole="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setScore(n)} testID={`star-${n}`} accessibilityRole="radio" accessibilityLabel={`${n} yıldız`} hitSlop={6}>
            <Text style={{ fontSize: 34, color: n <= score ? colors.star : colors.border }}>★</Text>
          </Pressable>
        ))}
      </View>
      {score ? (
        <>
          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            placeholder={score <= 3 ? "Neyi daha iyi yapabilirdik?" : "Yorumunuz (isteğe bağlı)"}
            maxLength={1000}
            multiline
          />
          <Button
            title="Gönder"
            testID="rating-submit"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                const r = await api.rateOrder(order, score, comment);
                setGoogle(r.googleReviewUrl ?? "");
                onRated();
              } catch (e) {
                setError(e instanceof ApiError ? e.message : "Gönderilemedi");
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      ) : null}
      <ErrorBox message={error} />
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
        <Card style={{ backgroundColor: colors.lime }}>
          <Text style={{ ...font("black"), fontSize: 18, color: colors.ink }}>Siparişiniz alındı 🎉</Text>
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

      {!["teslim_edildi", "iptal", "geri_teslim"].includes(order.status) ? <OrderMap order={order} /> : null}
      {order.failedAt ? (
        <Card style={{ borderColor: "#9A3412" }}>
          <Text style={{ ...font("extrabold") }} testID="failed-info">
            Teslim edilemedi{order.failedReason ? `: ${FAILED_DELIVERY_REASONS[order.failedReason]}` : ""}
          </Text>
          <Muted>
            {order.status === "geri_teslim"
              ? "Paket size geri teslim edildi."
              : "Paket size geri getiriliyor. Dönüş ayağı ücreti (gidişin %50'si) fiyata eklendi."}
          </Muted>
        </Card>
      ) : null}
      {order.deliveryCode && order.status !== "teslim_edildi" && order.status !== "iptal" ? (
        <Card>
          <Text style={{ ...font("extrabold") }} testID="delivery-code">
            Teslim kodu: {order.deliveryCode}
          </Text>
          <Muted>Gönderi yola çıkınca alıcıya SMS ile de gider. Kurye bu kodu almadan teslim edemez.</Muted>
        </Card>
      ) : null}
      {order.slaMissed ? (
        <Card>
          <Muted>Acil teslim taahhüdü aşıldı; acil ek ücreti sonraki siparişinizden otomatik düşülecek. Özür dileriz.</Muted>
        </Card>
      ) : null}

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
          <Text style={{ ...font("extrabold") }}>Kuryeniz: {order.courierName}</Text>
          {order.status === "kuryeye_atandi" && order.arrivedPickupAt ? (
            <Text testID="arrived-pickup" style={{ color: colors.success, ...font("bold") }}>
              📍 Kurye alış adresinde ({formatTime(order.arrivedPickupAt)})
            </Text>
          ) : null}
          {(order.status === "yolda" || order.status === "sorunlu") && order.arrivedDropoffAt ? (
            <Text style={{ color: colors.success, ...font("bold") }}>📍 Kurye teslim adresinde ({formatTime(order.arrivedDropoffAt)})</Text>
          ) : null}
          {["kuryeye_atandi", "alindi", "yolda", "sorunlu", "geri_donuyor"].includes(order.status) ? (
            <Button
              title="Kuryeye yaz"
              variant="secondary"
              onPress={() => router.push({ pathname: "/mesajlar/[id]", params: { id: order.id, role: "musteri" } })}
              testID="open-chat"
            />
          ) : null}
          {order.courierPhone ? (
            <Button title="Kuryeyi ara" variant="secondary" onPress={() => Linking.openURL(`tel:${order.courierPhone}`)} />
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Muted>Nereden</Muted>
        <Text style={{ ...font("bold") }}>{order.pickupAddress}</Text>
        {order.pickupDetails ? <Muted>{order.pickupDetails}</Muted> : null}
        <Muted>Nereye</Muted>
        <Text style={{ ...font("bold") }}>{order.dropoffAddress}</Text>
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

      {order.status === "teslim_edildi" ? <RateCard order={order} onRated={load} /> : null}

      {order.invoicePdfUrl ? (
        <Button title="Faturayı görüntüle" variant="secondary" onPress={() => Linking.openURL(order.invoicePdfUrl!)} />
      ) : null}
      <ErrorBox message={error} />
      {order.cancelReason ? <Muted>İptal nedeni: {order.cancelReason}</Muted> : null}

      {cancellable && !cancelOpen ? <Button title="Siparişi iptal et" variant="secondary" onPress={() => setCancelOpen(true)} /> : null}
      {cancelOpen ? (
        <Card>
          <Text style={{ ...font("bold") }}>İptal nedeni</Text>
          <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Kısaca yazın" />
          <Button title="İptal et" variant="danger" onPress={cancel} loading={busy} disabled={reason.trim().length < 3} />
          <Button title="Vazgeç" variant="secondary" onPress={() => setCancelOpen(false)} />
        </Card>
      ) : null}
    </Screen>
  );
}
