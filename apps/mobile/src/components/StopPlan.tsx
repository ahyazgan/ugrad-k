import { planStops, STOP_LABELS, stopsDirectionsUrl } from "@yazgan/shared";
import { router } from "expo-router";
import { Linking, Pressable, View } from "react-native";
import { Button, Card, Muted, Txt, colors } from "@/components/ui";
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
      <Txt weight="black" size={18} style={{ letterSpacing: -0.4 }}>
        Durak sırası
      </Txt>
      {stops.map((s, i) => (
        <Pressable
          key={`${s.jobId}-${s.kind}`}
          onPress={() => router.push({ pathname: "/is/[id]", params: { id: s.jobId } })}
          testID={`stop-${i}`}
          style={{ flexDirection: "row", gap: 10, minHeight: 44, paddingVertical: 4, alignItems: "center" }}
        >
          {/* Sıradaki durak: siyah daire + limon numara (limon yazı yalnız siyah zeminde) */}
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: i === 0 ? colors.ink : colors.bg,
            }}
          >
            <Txt weight="black" size={13} color={i === 0 ? colors.lime : colors.ink}>
              {i + 1}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt weight="bold">
              {STOP_LABELS[s.kind]} · {s.orderNo}
              {s.urgent && s.kind === "teslim" ? " ⚡" : ""}
            </Txt>
            <Txt numberOfLines={1} size={13} color={colors.muted}>
              {s.address}
            </Txt>
          </View>
          <Txt weight="bold" size={13} color={s.late ? colors.danger : colors.muted}>
            ~{s.etaMinutes} dk
          </Txt>
        </Pressable>
      ))}
      {stops.some((s) => s.late) ? <Muted style={{ color: colors.danger }}>Bir acil teslim taahhüdü bu sırayla kaçabilir; yöneticiye haber verin.</Muted> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          {/* Ekranda limon ana eylem teklif kartında olabilir: burada siyah */}
          <Button title="Sıradakine git" variant="dark" onPress={() => openDirections(next.lat, next.lng, next.address)} />
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
