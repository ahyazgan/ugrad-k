import { courierPerformance, formatTL, PERFORMANCE_TIERS, type PerformanceStats } from "@yazgan/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Card, ErrorBox, Loading, Muted, Row, Screen, Title, colors } from "@/components/ui";
import { api, ApiError, type CourierEarnings } from "@/lib/api";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Kazancim() {
  const [data, setData] = useState<CourierEarnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perf, setPerf] = useState<PerformanceStats | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.courierEarnings().then(setData, (e) => setError(e instanceof ApiError ? e.message : "Yüklenemedi"));
      api.myPerformance().then(setPerf, () => undefined);
    }, []),
  );

  if (!data) return error ? <Screen><ErrorBox message={error} /></Screen> : <Loading />;
  const net = data.unpaid.netKurus;
  const p = perf ? courierPerformance(perf) : null;
  return (
    <Screen>
      {p ? (
        <Card style={{ gap: 4 }}>
          <Muted>Performansım (son 30 gün)</Muted>
          <Text testID="my-performance" style={{ fontSize: 22, fontWeight: "800", color: colors.primary }}>
            {p.score ?? "—"} · {PERFORMANCE_TIERS[p.tier]}
          </Text>
          {p.parts.map((x) => (
            <Row key={x.key} label={x.label} value={x.value == null ? "az veri" : `%${Math.round(x.value * 100)}`} />
          ))}
          <Muted>Yüksek puan, otomatik iş atamada öncelik demektir. Teklifleri yanıtlamak, aldığınız vardiyaya gelmek ve acil işleri zamanında teslim etmek puanı yükseltir.</Muted>
        </Card>
      ) : null}
      <Card>
        <Muted>Hesaplaşılmamış kazanç</Muted>
        <Title>{formatTL(data.unpaid.earningsKurus)}</Title>
        <Row label="Teslimat" value={String(data.unpaid.deliveries)} />
        <Row label="Elinizdeki nakit tahsilat" value={formatTL(data.unpaid.cashKurus)} />
        <View testID="earnings-net">
          <Row bold label={net >= 0 ? "Size ödenecek" : "Şirkete teslim edeceğiniz"} value={formatTL(Math.abs(net))} />
        </View>
        {data.rates ? (
          <Muted>
            İş başı {formatTL(data.rates.perJobKurus)} + km başı {formatTL(data.rates.perKmKurus)}; acil ve gece işlerde prim, köprü
            geçişi iade. Teslimatlar birkaç dakika içinde eklenir.
          </Muted>
        ) : null}
      </Card>

      <Card>
        <Text style={{ fontWeight: "700", color: colors.text }}>Teslimatlar</Text>
        {data.items.length === 0 ? <Muted>Hesaplaşılmamış teslimat yok.</Muted> : null}
        {data.items.slice(0, 50).map((i) => (
          <View key={i.orderId} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}>
            <Row label={`${i.orderNo} · ${fmtDate(i.deliveredAt)} · ${i.km.toLocaleString("tr-TR")} km`} value={formatTL(i.totalKurus)} />
            {i.cashCollectedKurus ? <Muted>Nakit tahsilat: {formatTL(i.cashCollectedKurus)}</Muted> : null}
          </View>
        ))}
      </Card>

      {data.payouts.length ? (
        <Card>
          <Text style={{ fontWeight: "700", color: colors.text }}>Son hesaplaşmalar</Text>
          {data.payouts.map((p) => (
            <Row
              key={p.id}
              label={`${fmtDate(p.createdAt)} · ${p.deliveryCount} teslimat${p.note ? ` · ${p.note}` : ""}`}
              value={`${p.netKurus >= 0 ? "" : "−"}${formatTL(Math.abs(p.netKurus))}`}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
