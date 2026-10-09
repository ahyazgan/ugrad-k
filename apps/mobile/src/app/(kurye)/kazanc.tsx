import { courierPerformance, formatTL, incentiveProgress, incentiveScope, PERFORMANCE_TIERS, type PerformanceStats } from "@yazgan/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { BigTitle, EmptyState, HandTag } from "@/components/Neo";
import { Sticker } from "@/components/Sticker";
import { Card, ErrorBox, Loading, Muted, Row, Screen, Txt, colors, radii, type } from "@/components/ui";
import { api, ApiError, type CourierEarnings, type IncentiveStatus } from "@/lib/api";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** "2026-10-07" → "7 Eki" */
const fmtDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });

/** Kart başlığı (Archivo 900) */
function CardTitle({ children }: { children: string }) {
  return (
    <Txt weight="black" size={18} style={{ letterSpacing: -0.4 }}>
      {children}
    </Txt>
  );
}

/** İlerleme çubuğu: siyah zemin + limon dolgu */
function Progress({ ratio }: { ratio: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ height: 12, borderRadius: radii.pill, backgroundColor: colors.ink, overflow: "hidden", padding: 2 }}
    >
      <View style={{ width: `${pct}%`, height: 8, borderRadius: radii.pill, backgroundColor: colors.lime }} />
    </View>
  );
}

export default function Kazancim() {
  const [data, setData] = useState<CourierEarnings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perf, setPerf] = useState<PerformanceStats | null>(null);
  const [incentives, setIncentives] = useState<IncentiveStatus[]>([]);
  const { width } = useWindowDimensions();

  useFocusEffect(
    useCallback(() => {
      api.courierEarnings().then(setData, (e) => setError(e instanceof ApiError ? e.message : "Yüklenemedi"));
      api.myPerformance().then(setPerf, () => undefined);
      api.myIncentives().then(setIncentives, () => undefined);
    }, []),
  );

  if (!data)
    return error ? (
      <Screen safeTop>
        <ErrorBox message={error} />
      </Screen>
    ) : (
      <Loading />
    );
  const net = data.unpaid.netKurus;
  const p = perf ? courierPerformance(perf) : null;
  const amount = formatTL(Math.abs(net));
  // Tutar tek satıra sığsın: en fazla 52 px (sekme kökü başlık ölçüsü)
  const titleSize = Math.max(36, Math.min(52, Math.floor((width - 32) / (amount.length * 0.62))));

  return (
    <Screen safeTop>
      {/* Başlık: ödenecek tutar + el yazısı etiket; sağ üstte kart çıkartması */}
      <View style={{ marginTop: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", minHeight: 52 }}>
          <View style={{ gap: 4, paddingTop: 6 }}>
            <Txt style={type.label}>KAZANCIM</Txt>
            <Txt size={13} color={colors.muted}>
              Hesaplaşılmamış · {data.unpaid.deliveries} teslimat
            </Txt>
          </View>
          <Sticker name="kart" size={72} rotation={6} style={{ marginTop: -6, marginRight: 2 }} />
        </View>
        <View testID="earnings-headline">
          <BigTitle size={titleSize}>{amount}</BigTitle>
        </View>
        <HandTag rotate={-5} style={{ marginTop: 6 }}>
          {net >= 0 ? "sana ödenecek" : "şirkete teslim edeceğin"}
        </HandTag>
      </View>

      {/* 1 · Kazanç */}
      <Card>
        <CardTitle>Kazanç</CardTitle>
        <Muted>Hesaplaşılmamış kazanç</Muted>
        <Txt weight="black" size={26} style={{ letterSpacing: -0.8, lineHeight: 30 }}>
          {formatTL(data.unpaid.earningsKurus)}
        </Txt>
        <Row label="Teslimat" value={String(data.unpaid.deliveries)} />
        {data.unpaid.incentiveKurus ? <Row label="Hedef primleri" value={formatTL(data.unpaid.incentiveKurus)} /> : null}
        <Row label="Elinizdeki nakit tahsilat" value={formatTL(data.unpaid.cashKurus)} />
        <View testID="earnings-net" style={{ borderTopWidth: 1, borderTopColor: colors.bg, paddingTop: 10 }}>
          <Row bold label={net >= 0 ? "Size ödenecek" : "Şirkete teslim edeceğiniz"} value={formatTL(Math.abs(net))} />
        </View>
        {data.rates ? (
          <Muted>
            İş başı {formatTL(data.rates.perJobKurus)} + km başı {formatTL(data.rates.perKmKurus)}; acil ve gece işlerde prim, köprü
            geçişi iade. Teslimatlar birkaç dakika içinde eklenir.
          </Muted>
        ) : null}
      </Card>

      {/* 2 · Prim */}
      {incentives.length || data.incentives.length ? (
        <Card style={{ gap: 10 }}>
          <CardTitle>Primler</CardTitle>
          {incentives.map((i) => {
            const pr = incentiveProgress(i, i.jobs, i.earningKurus);
            const target = pr.next?.target ?? i.tiers.at(-1)?.target ?? 0;
            const ratio = i.kind === "hedef" && target ? Math.min(1, i.jobs / target) : null;
            return (
              <View key={i.id} testID="incentive-card" style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Txt weight="extrabold" size={15}>
                    {i.title}
                  </Txt>
                  <Txt size={13} color={colors.muted}>
                    {incentiveScope(i)}
                  </Txt>
                </View>
                {ratio != null ? <Progress ratio={ratio} /> : null}
                <Txt testID="incentive-progress" weight="bold">
                  {pr.text}
                </Txt>
                {i.kind === "hedef" && i.tiers.length > 1 ? (
                  <Muted>Kademeler: {i.tiers.map((t) => `${t.target} iş → ${formatTL(t.rewardKurus)}`).join(" · ")}</Muted>
                ) : null}
              </View>
            );
          })}
          {data.incentives.length ? (
            <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.bg, paddingTop: 10 }}>
              <Txt style={type.label}>KAZANILAN PRİMLER</Txt>
              {data.incentives.map((a) => (
                <View key={a.id} testID="incentive-award">
                  <Row label={`${a.title} · ${fmtDay(a.periodStart)}${a.periodEnd !== a.periodStart ? `–${fmtDay(a.periodEnd)}` : ""}`} value={formatTL(a.amountKurus)} />
                  {a.detail ? <Muted>{a.detail}</Muted> : null}
                </View>
              ))}
            </View>
          ) : null}
          {incentives.length ? (
            <Muted>Prim dönem bitince (gün sonu / hafta sonu) hesaplanır ve hesaplaşmaya eklenir; ulaşılan en yüksek kademe ödenir.</Muted>
          ) : null}
        </Card>
      ) : null}

      {/* 3 · Performans */}
      {p ? (
        <Card style={{ gap: 6 }}>
          <CardTitle>Performans</CardTitle>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Muted>Son 30 gün</Muted>
              <Txt testID="my-performance" weight="black" size={26} style={{ letterSpacing: -0.8, lineHeight: 30 }}>
                {p.score ?? "—"} · {PERFORMANCE_TIERS[p.tier]}
              </Txt>
            </View>
            <Sticker name="yildiz" size={44} rotation={-8} />
          </View>
          {p.parts.map((x) => (
            <Row key={x.key} label={x.label} value={x.value == null ? "az veri" : `%${Math.round(x.value * 100)}`} />
          ))}
          <Muted>Yüksek puan, otomatik iş atamada öncelik demektir. Teklifleri yanıtlamak, aldığınız vardiyaya gelmek ve acil işleri zamanında teslim etmek puanı yükseltir.</Muted>
        </Card>
      ) : null}

      <Card>
        <CardTitle>Teslimatlar</CardTitle>
        {data.items.length === 0 ? (
          <EmptyState
            testID="earnings-empty"
            surface={false}
            sticker="motor"
            stickerSize={88}
            rotation={-6}
            title="Henüz teslimat yok."
            body="Teslim ettiğiniz işler birkaç dakika içinde burada görünür."
            action={{ label: "İşlerime git", variant: "secondary", onPress: () => router.navigate("/(kurye)") }}
          />
        ) : null}
        {data.items.slice(0, 50).map((i) => (
          <View key={i.orderId} style={{ borderTopWidth: 1, borderTopColor: colors.bg, paddingTop: 8 }}>
            <Row label={`${i.orderNo} · ${fmtDate(i.deliveredAt)} · ${i.km.toLocaleString("tr-TR")} km`} value={formatTL(i.totalKurus)} />
            {i.cashCollectedKurus ? <Muted>Nakit tahsilat: {formatTL(i.cashCollectedKurus)}</Muted> : null}
          </View>
        ))}
      </Card>

      {data.payouts.length ? (
        <Card>
          <CardTitle>Son hesaplaşmalar</CardTitle>
          {data.payouts.map((po) => (
            <Row
              key={po.id}
              label={`${fmtDate(po.createdAt)} · ${po.deliveryCount} teslimat${po.incentiveKurus ? ` + ${formatTL(po.incentiveKurus)} prim` : ""}${po.note ? ` · ${po.note}` : ""}`}
              value={`${po.netKurus >= 0 ? "" : "−"}${formatTL(Math.abs(po.netKurus))}`}
            />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
