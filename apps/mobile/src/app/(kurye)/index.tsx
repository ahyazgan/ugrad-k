import { ORDER_STATUS_LABELS, type Compliance } from "@yazgan/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { complianceFor, DocumentWarning } from "@/components/CourierDocs";
import { OfferCard } from "@/components/OfferCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, Card, ErrorBox, Muted, Screen, Title, colors } from "@/components/ui";
import { api, ApiError, type OrderSummary, type Shift } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { currentPosition, lastKnownPosition, setActiveOrderForLocation, startTracking, stopTracking } from "@/lib/location";

const ACTIVE = ["kuryeye_atandi", "alindi", "yolda", "sorunlu"];

export default function KuryeIsler() {
  const [shift, setShift] = useState<Shift | null | undefined>(undefined);
  const [jobs, setJobs] = useState<OrderSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingMsg, setTrackingMsg] = useState<string | null>(null);
  const [compliance, setCompliance] = useState<Compliance | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [offerMsg, setOfferMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, j] = await Promise.all([api.getOpenShift(), api.listCourierJobs()]);
      setShift(s);
      setJobs(j);
      // Konumu öncelikle yoldaki, sonra alınmış, yoksa atanmış (alışa gidilen) işe bağla:
      // müşteri yalnız kendi siparişine bağlı konumu görür (RLS). Yanıt bekleyen teklif sayılmaz.
      const live =
        j.find((x) => x.status === "yolda") ??
        j.find((x) => x.status === "alindi") ??
        j.find((x) => x.status === "kuryeye_atandi" && !x.offerExpiresAt);
      if (j.some((x) => x.offerExpiresAt)) lastKnownPosition().then(setMe, () => undefined);
      setActiveOrderForLocation(live?.id ?? null);
      api.courierDocuments().then((d) => setCompliance(complianceFor(d)), () => undefined);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Yüklenemedi");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => api.subscribeCourierJobs(load), [load]);

  // Uygulama yeniden açıldığında vardiya açıksa takibi sürdür
  useEffect(() => {
    if (shift) startTracking().then((r) => setTrackingMsg(r.message ?? null), () => undefined);
  }, [shift?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleShift() {
    setBusy(true);
    setError(null);
    try {
      if (shift) {
        const open = jobs.filter((j) => ["alindi", "yolda"].includes(j.status));
        if (open.length) throw new ApiError("Elinizde paket varken vardiya kapatılamaz");
        await api.endShift(await currentPosition());
        await stopTracking();
        setTrackingMsg(null);
      } else {
        const tracking = await startTracking();
        if (tracking.mode === "off") throw new ApiError(tracking.message ?? "Konum izni gerekli");
        setTrackingMsg(tracking.message ?? null);
        await api.startShift(await currentPosition());
      }
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İşlem başarısız");
    } finally {
      setBusy(false);
    }
  }

  const offers = jobs.filter((j): j is OrderSummary & { offerExpiresAt: string } => !!j.offerExpiresAt);
  const active = jobs.filter((j) => ACTIVE.includes(j.status) && !j.offerExpiresAt);
  const done = jobs.filter((j) => j.status === "teslim_edildi");

  return (
    <Screen>
      <Card style={shift ? { borderColor: colors.success, backgroundColor: colors.successLight } : undefined}>
        <Title>{shift ? "Vardiyadasınız" : "Vardiya kapalı"}</Title>
        <Muted>
          {shift
            ? `Başlangıç ${formatTime(shift.startedAt)} · konumunuz yalnızca vardiya boyunca paylaşılır`
            : "İş almak için vardiyayı başlatın. Çalışma saatleriniz kayıt altına alınır."}
        </Muted>
        {trackingMsg ? <Muted>{trackingMsg}</Muted> : null}
        <Button
          title={shift ? "Vardiyayı bitir" : "Vardiyayı başlat"}
          variant={shift ? "secondary" : "primary"}
          onPress={toggleShift}
          loading={busy}
          disabled={shift === undefined}
          testID="shift-toggle"
        />
      </Card>
      <ErrorBox message={error} />
      {offerMsg ? <Muted style={{ color: colors.danger }}>{offerMsg}</Muted> : null}
      {offers.map((j) => (
        <OfferCard
          key={j.id}
          job={j}
          me={me}
          onDone={(m) => {
            setOfferMsg(m);
            load();
          }}
        />
      ))}

      <DocumentWarning c={compliance} />

      <Title>Aktif işler ({active.length})</Title>
      {active.length === 0 ? <Muted>{shift ? "Şu an atanmış iş yok. Yeni iş atandığında burada görünür." : "—"}</Muted> : null}
      {active.map((j) => (
        <Pressable key={j.id} onPress={() => router.push({ pathname: "/is/[id]", params: { id: j.id } })} testID={`job-${j.orderNo}`}>
          <Card style={{ gap: 6, borderColor: j.urgent ? colors.accent : colors.border, borderWidth: j.urgent ? 2 : 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "700", fontSize: 16 }}>
                {j.orderNo}
                {j.urgent ? "  ⚡ ACİL" : ""}
              </Text>
              <StatusBadge status={j.status} />
            </View>
            <Text numberOfLines={2}>↑ {j.pickupAddress}</Text>
            <Text numberOfLines={2}>↓ {j.dropoffAddress}</Text>
          </Card>
        </Pressable>
      ))}

      {done.length ? (
        <>
          <Title>Bugün teslim edilen ({done.length})</Title>
          {done.map((j) => (
            <Card key={j.id} style={{ gap: 4 }}>
              <Text style={{ fontWeight: "600" }}>
                {j.orderNo} · {ORDER_STATUS_LABELS[j.status]}
              </Text>
              <Muted>{j.dropoffAddress}</Muted>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
