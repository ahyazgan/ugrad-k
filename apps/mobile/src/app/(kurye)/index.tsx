import { ORDER_STATUS_LABELS, type Compliance } from "@yazgan/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { BusyAreas } from "@/components/BusyAreas";
import { complianceFor, DocumentWarning } from "@/components/CourierDocs";
import { BigTitle, InkChip, Wordmark } from "@/components/Neo";
import { OfferCard } from "@/components/OfferCard";
import { OutboxBanner } from "@/components/OutboxBanner";
import { StopPlan } from "@/components/StopPlan";
import { StatusBadge } from "@/components/StatusBadge";
import { Sticker } from "@/components/Sticker";
import { Button, Card, ErrorBox, Muted, Screen, Title, colors, font } from "@/components/ui";
import { api, ApiError, type OrderSummary, type Shift } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { currentPosition, lastKnownPosition, setActiveOrderForLocation, startTracking, stopTracking } from "@/lib/location";

const ACTIVE = ["kuryeye_atandi", "alindi", "yolda", "sorunlu", "geri_donuyor"];

export default function KuryeIsler() {
  const [shift, setShift] = useState<Shift | null | undefined>(undefined);
  const [jobs, setJobs] = useState<OrderSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingMsg, setTrackingMsg] = useState<string | null>(null);
  const [compliance, setCompliance] = useState<Compliance | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [offerMsg, setOfferMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const { width } = useWindowDimensions();
  // "gelsin!" satırının sağındaki boşluğa sığacak motor genişliği
  const motorSize = Math.max(56, Math.min(120, width - 32 - 210));

  const load = useCallback(async () => {
    try {
      const [s, j] = await Promise.all([api.getOpenShift(), api.listCourierJobs()]);
      setShift(s);
      setJobs(j);
      // Konumu öncelikle yoldaki, sonra alınmış, yoksa atanmış (alışa gidilen) işe bağla:
      // müşteri yalnız kendi siparişine bağlı konumu görür (RLS). Yanıt bekleyen teklif sayılmaz.
      const live =
        j.find((x) => x.status === "yolda") ??
        j.find((x) => x.status === "geri_donuyor") ??
        j.find((x) => x.status === "alindi") ??
        j.find((x) => x.status === "kuryeye_atandi" && !x.offerExpiresAt);
      // Teklif mesafesi ve durak sırası için kuryenin son konumu
      // Boştayken de: yoğun bölgelere uzaklık için
      if (j.some((x) => ACTIVE.includes(x.status)) || s) lastKnownPosition().then(setMe, () => undefined);
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
        const open = jobs.filter((j) => ["alindi", "yolda", "geri_donuyor"].includes(j.status));
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

  async function toggleBreak() {
    setBusy(true);
    setError(null);
    try {
      if (shift?.break) {
        await api.endBreak();
        const tracking = await startTracking();
        setTrackingMsg(tracking.message ?? null);
      } else {
        await api.startBreak();
        // Elde iş yoksa molada konum paylaşılmaz (KVKK: yalnız gerekli veri)
        if (!jobs.some((j) => ["kuryeye_atandi", "alindi", "yolda", "geri_donuyor"].includes(j.status) && !j.offerExpiresAt)) await stopTracking();
      }
      setNow(Date.now());
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İşlem başarısız");
    } finally {
      setBusy(false);
    }
  }

  const offers = jobs.filter((j): j is OrderSummary & { offerExpiresAt: string } => !!j.offerExpiresAt);
  const active = jobs.filter((j) => ACTIVE.includes(j.status) && !j.offerExpiresAt);
  const done = jobs.filter((j) => j.status === "teslim_edildi" || j.status === "geri_teslim");

  return (
    <Screen safeTop>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Wordmark size={34} tagline={false} />
        <InkChip>KURYE</InkChip>
      </View>
      <View>
        <BigTitle size={56}>{"Kolay\ngelsin!"}</BigTitle>
        <Sticker name="motor" size={motorSize} rotation={-4} style={{ position: "absolute", right: 0, top: -6 }} />
      </View>
      {shift?.break ? (
        <Card style={{ borderColor: colors.accent, backgroundColor: "#FEF3C7" }}>
          <Title>Moladasınız</Title>
          <Text testID="break-info" style={{ color: colors.muted }}>
            {Math.max(0, Math.floor((now - new Date(shift.break.startedAt).getTime()) / 60_000))} dk · molada yeni iş teklifi gelmez
          </Text>
          {shift.break.auto ? (
            <Text style={{ color: colors.danger }}>Üst üste iş tekliflerine yanıt vermediğiniz için otomatik molaya alındınız.</Text>
          ) : null}
          {active.length ? <Muted>Elinizdeki {active.length} iş devam ediyor; konumunuz bu işler için paylaşılmaya devam eder.</Muted> : null}
          <Button title="Moladan dön" onPress={toggleBreak} loading={busy} testID="break-toggle" />
        </Card>
      ) : (
        <Card style={shift ? { backgroundColor: colors.lime } : undefined}>
          <Title>{shift ? "Vardiyadasınız" : "Vardiya kapalı"}</Title>
          <Muted>
            {shift
              ? `Başlangıç ${formatTime(shift.startedAt)} · konumunuz yalnızca vardiya boyunca paylaşılır`
              : "İş almak için vardiyayı başlatın. Çalışma saatleriniz kayıt altına alınır."}
          </Muted>
          {trackingMsg ? <Muted>{trackingMsg}</Muted> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {shift ? (
              <View style={{ flex: 1 }}>
                <Button title="Mola ver" variant="secondary" onPress={toggleBreak} disabled={busy} testID="break-toggle" />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button
                title={shift ? "Vardiyayı bitir" : "Vardiyayı başlat"}
                variant={shift ? "secondary" : "primary"}
                onPress={toggleShift}
                loading={busy}
                disabled={shift === undefined}
                testID="shift-toggle"
              />
            </View>
          </View>
        </Card>
      )}
      {shift ? (
        <Button title="🚨 Acil durum (SOS)" variant="danger" onPress={() => router.push("/sos")} testID="sos-open" />
      ) : null}
      <ErrorBox message={error} />
      <OutboxBanner onSent={load} />
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

      <StopPlan jobs={active} me={me} />
      {shift && !shift.break && !active.length && !offers.length ? <BusyAreas me={me} /> : null}

      <Title>Aktif işler ({active.length})</Title>
      {active.length === 0 ? <Muted>{shift ? "Şu an atanmış iş yok. Yeni iş atandığında burada görünür." : "—"}</Muted> : null}
      {active.map((j) => (
        <Pressable key={j.id} onPress={() => router.push({ pathname: "/is/[id]", params: { id: j.id } })} testID={`job-${j.orderNo}`}>
          <Card style={{ gap: 6, borderColor: j.urgent ? colors.ink : "transparent", borderWidth: 2 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ ...font("extrabold"), fontSize: 16 }}>
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
          <Title>Bugün tamamlanan ({done.length})</Title>
          {done.map((j) => (
            <Card key={j.id} style={{ gap: 4 }}>
              <Text style={{ ...font("bold") }}>
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
