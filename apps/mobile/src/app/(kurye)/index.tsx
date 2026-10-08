import { ORDER_STATUS_LABELS } from "@yazgan/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, Card, ErrorBox, Muted, Screen, Title, colors } from "@/components/ui";
import { api, ApiError, type OrderSummary, type Shift } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { currentPosition, setActiveOrderForLocation, startTracking, stopTracking } from "@/lib/location";

const ACTIVE = ["kuryeye_atandi", "alindi", "yolda", "sorunlu"];

export default function KuryeIsler() {
  const [shift, setShift] = useState<Shift | null | undefined>(undefined);
  const [jobs, setJobs] = useState<OrderSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingMsg, setTrackingMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, j] = await Promise.all([api.getOpenShift(), api.listCourierJobs()]);
      setShift(s);
      setJobs(j);
      // Konumu öncelikle yoldaki, yoksa alınmış işe bağla
      const live = j.find((x) => x.status === "yolda") ?? j.find((x) => x.status === "alindi");
      setActiveOrderForLocation(live?.id ?? null);
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

  const active = jobs.filter((j) => ACTIVE.includes(j.status));
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
