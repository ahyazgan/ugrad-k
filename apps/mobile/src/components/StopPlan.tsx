import { planStops, STOP_LABELS, stopsDirectionsUrl } from "@yazgan/shared";
import { router } from "expo-router";
import { Linking, Pressable, Text, View } from "react-native";
import { Button, Card, Muted, colors, font } from "@/components/ui";
import type { OrderSummary } from "@/lib/api";
import { openDirections } from "@/lib/navigation";

/** Elde birden fazla iş varken önerilen durak sırası (alış teslimden önce; acil taahhüt gözetilir) */
export function StopPlan({ jobs, me }: { jobs: OrderSummary[]; me: { lat: number; lng: number } | null }) {
  const stops = planStops(
    jobs
      .filter((j) => j.pickupPoint && j.dropoffPoint && !j.offerExpiresAt)
      .map((j) => ({
        id: j.id,
        orderNo: j.orderNo,
        status: j.status,
        pickup: { ...j.pickupPoint!, address: j.pickupAddress },
        dropoff: { ...j.dropoffPoint!, address: j.dropoffAddress },
        urgent: j.urgent,
        slaDueAt: j.slaDueAt ?? null,
      })),
    me,
  );
  if (stops.length < 2) return null;
  const next = stops[0]!;
  const all = stopsDirectionsUrl(stops);
  return (
    <Card style={{ gap: 6 }}>
      <Text style={{ ...font("extrabold"), fontSize: 16 }}>Durak sırası</Text>
      {stops.map((s, i) => (
        <Pressable
          key={`${s.jobId}-${s.kind}`}
          onPress={() => router.push({ pathname: "/is/[id]", params: { id: s.jobId } })}
          testID={`stop-${i}`}
          style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}
        >
          <Text style={{ ...font("black"), width: 18, color: i === 0 ? colors.accent : colors.primary }}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ ...font("bold") }}>
              {STOP_LABELS[s.kind]} · {s.orderNo}
              {s.urgent && s.kind === "teslim" ? " ⚡" : ""}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.muted }}>
              {s.address}
            </Text>
          </View>
          <Text style={{ color: s.late ? colors.danger : colors.muted }}>~{s.etaMinutes} dk</Text>
        </Pressable>
      ))}
      {stops.some((s) => s.late) ? <Muted style={{ color: colors.danger }}>Bir acil teslim taahhüdü bu sırayla kaçabilir; yöneticiye haber verin.</Muted> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title="Sıradakine git" onPress={() => openDirections(next.lat, next.lng, next.address)} />
        </View>
        {all ? (
          <View style={{ flex: 1 }}>
            <Button title="Tüm rota" variant="secondary" onPress={() => Linking.openURL(all)} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}
