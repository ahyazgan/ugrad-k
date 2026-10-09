import Ionicons from "@expo/vector-icons/Ionicons";
import {
  courierPerformance,
  formatTL,
  istanbulDay,
  ORDER_STATUS_LABELS,
  PERFORMANCE_TIERS,
  slotLabel,
  WEEKDAY_LABELS,
  type Compliance,
} from "@yazgan/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View, type ScrollView } from "react-native";
import { BusyAreas } from "@/components/BusyAreas";
import { complianceFor, DocumentWarning } from "@/components/CourierDocs";
import { BigTitle, EmptyState, InkChip, Wordmark } from "@/components/Neo";
import { OfferCard } from "@/components/OfferCard";
import { OutboxBanner } from "@/components/OutboxBanner";
import { StopPlan } from "@/components/StopPlan";
import { StatusBadge } from "@/components/StatusBadge";
import { Sticker } from "@/components/Sticker";
import { Button, Card, ErrorBox, Muted, Screen, Title, Txt, colors, radii, type } from "@/components/ui";
import { api, ApiError, type OrderSummary, type Shift, type ShiftSlot } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { useAppWidth } from "@/lib/layout";
import { currentPosition, lastKnownPosition, setActiveOrderForLocation, startTracking, stopTracking } from "@/lib/location";

const ACTIVE = ["kuryeye_atandi", "alindi", "yolda", "sorunlu", "geri_donuyor"];

/** "2026-10-10" → "Yarın" / "Bugün" / "Pazartesi" (İstanbul günü) */
function relativeDay(day: string) {
  const today = istanbulDay();
  if (day === today) return "Bugün";
  if (day === istanbulDay(new Date(Date.now() + 86_400_000))) return "Yarın";
  const dow = ((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  return WEEKDAY_LABELS[dow];
}

const longDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: "UTC" });

/** Vardiya kapalıyken: bugünün özeti (iş sayısı · kazanç · seviye) */
interface TodaySummary {
  earningKurus: number;
  tier: string | null;
}

/** Sıradaki vardiya kartı (vardiya planından); yoksa vardiya seçmeye yönlendirir */
function NextShiftCard({ slot }: { slot: ShiftSlot | null }) {
  return (
    <Pressable
      testID="next-shift"
      accessibilityRole="button"
      accessibilityLabel={slot ? `Sıradaki vardiyan: ${relativeDay(slot.day)} ${slotLabel(slot.startsAt, slot.endsAt)}` : "Vardiya seç"}
      onPress={() => router.navigate("/(kurye)/vardiya")}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        padding: 18,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="calendar" size={22} color={colors.ink} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={type.label}>SIRADAKİ VARDİYAN</Txt>
        {slot ? (
          <>
            <Txt weight="black" size={22} style={{ letterSpacing: -0.6, lineHeight: 26 }}>
              {relativeDay(slot.day)} · {slotLabel(slot.startsAt, slot.endsAt)}
            </Txt>
            <Txt size={13} color={colors.muted}>
              {longDate(slot.day)} · 1 saat önce hatırlatılır
            </Txt>
          </>
        ) : (
          <>
            <Txt weight="black" size={20} style={{ letterSpacing: -0.5 }}>
              Henüz seçilmedi
            </Txt>
            <Txt size={13} color={colors.muted}>
              Önümüzdeki 14 günden vardiya seçin.
            </Txt>
          </>
        )}
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.ink} />
    </Pressable>
  );
}

/** Siyah özet şeridi: bugün tamamlanan iş · kazanç · seviye → Kazancım */
function TodayStrip({ jobs, summary }: { jobs: number; summary: TodaySummary | null }) {
  const parts = [`${jobs} iş`, summary ? formatTL(summary.earningKurus) : "—", summary?.tier ?? "—"];
  return (
    <Pressable
      testID="today-strip"
      accessibilityRole="button"
      accessibilityLabel={`Bugün: ${parts.join(", ")}. Kazancım`}
      onPress={() => router.navigate("/(kurye)/kazanc")}
      style={({ pressed }) => ({
        minHeight: 70,
        backgroundColor: colors.ink,
        borderRadius: radii.pill,
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: 24,
        paddingRight: 8,
        gap: 12,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <Txt weight="bold" size={11} color={colors.onInkMuted} style={{ letterSpacing: 0.8 }}>
          BUGÜN
        </Txt>
        <Txt weight="black" size={18} color="#fff" numberOfLines={1} style={{ letterSpacing: -0.4 }}>
          {parts.join(" · ")}
        </Txt>
      </View>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.lime, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="wallet" size={22} color={colors.ink} />
      </View>
    </Pressable>
  );
}

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
  const [nextSlot, setNextSlot] = useState<ShiftSlot | null | undefined>(undefined);
  const [today, setToday] = useState<TodaySummary | null>(null);
  // "Yoğun bölgeleri gör" için kartın kaydırma konumu (kart yoksa yükseklik 0)
  const scrollRef = useRef<ScrollView>(null);
  const [busyArea, setBusyArea] = useState<{ y: number; h: number }>({ y: 0, h: 0 });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const width = useAppWidth();
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
      if (!s) {
        // Vardiya kapalı: sıradaki vardiya ve bugünün özeti (hata olursa kartlar sade kalır)
        const t = Date.now();
        api.listShiftSlots(istanbulDay(), 14).then(
          (slots) => setNextSlot(slots.find((x) => x.mine && new Date(x.endsAt).getTime() > t) ?? null),
          () => setNextSlot(null),
        );
        Promise.all([api.courierEarnings(), api.myPerformance().catch(() => null)]).then(
          ([e, p]) => {
            const day = istanbulDay();
            const earningKurus = e.items.filter((i) => istanbulDay(new Date(i.deliveredAt)) === day).reduce((sum, i) => sum + i.totalKurus, 0);
            const perf = p ? courierPerformance(p) : null;
            setToday({ earningKurus, tier: perf ? PERFORMANCE_TIERS[perf.tier] : null });
          },
          () => setToday(null),
        );
      }
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
  // Teklif varken başlık küçülür ve motor gizlenir: geri sayım ve "Kabul et" ilk ekranda kalsın
  const compact = offers.length > 0;
  const idle = !!shift && !shift.break && !active.length && !offers.length;

  return (
    <Screen safeTop scrollRef={scrollRef}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Wordmark size={34} tagline={false} />
        <InkChip>KURYE</InkChip>
      </View>
      {compact ? (
        <BigTitle size={36}>Kolay gelsin!</BigTitle>
      ) : (
        <View>
          <BigTitle size={56}>{"Kolay\ngelsin!"}</BigTitle>
          <Sticker name="motor" size={motorSize} rotation={-4} style={{ position: "absolute", right: 0, top: -6 }} />
        </View>
      )}
      {shift?.break ? (
        <Card style={{ backgroundColor: colors.warnLight }}>
          <Title>Moladasınız</Title>
          <Txt testID="break-info" color={colors.mutedDark}>
            {Math.max(0, Math.floor((now - new Date(shift.break.startedAt).getTime()) / 60_000))} dk · molada yeni iş teklifi gelmez
          </Txt>
          {shift.break.auto ? (
            <Txt weight="bold" color={colors.danger}>
              Üst üste iş tekliflerine yanıt vermediğiniz için otomatik molaya alındınız.
            </Txt>
          ) : null}
          {active.length ? <Muted>Elinizdeki {active.length} iş devam ediyor; konumunuz bu işler için paylaşılmaya devam eder.</Muted> : null}
          <Button title="Moladan dön" onPress={toggleBreak} loading={busy} testID="break-toggle" />
        </Card>
      ) : (
        <Card style={shift ? { backgroundColor: colors.lime } : undefined}>
          <Title>{shift ? "Vardiyadasınız" : "Vardiya kapalı"}</Title>
          <Muted style={shift ? { color: colors.mutedDark } : undefined}>
            {shift
              ? `Başlangıç ${formatTime(shift.startedAt)} · konumunuz yalnızca vardiya boyunca paylaşılır`
              : "İş almak için vardiyayı başlatın. Çalışma saatleriniz kayıt altına alınır."}
          </Muted>
          {trackingMsg && !compact ? <Muted style={{ color: colors.mutedDark }}>{trackingMsg}</Muted> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {shift ? (
              <View style={{ flex: 1 }}>
                <Button title="Mola ver" variant="secondary" onPress={toggleBreak} disabled={busy} testID="break-toggle" />
              </View>
            ) : null}
            {/* "Vardiyayı bitir" tek satıra sığsın */}
            <View style={{ flex: shift ? 1.5 : 1 }}>
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
      <ErrorBox message={error} />
      <OutboxBanner onSent={load} />
      {offerMsg ? <Muted style={{ color: colors.danger }}>{offerMsg}</Muted> : null}
      {offers.map((j, i) => (
        <OfferCard
          key={j.id}
          job={j}
          me={me}
          primary={i === 0}
          onDone={(m) => {
            setOfferMsg(m);
            load();
          }}
        />
      ))}
      {shift ? <Button title="🚨 Acil durum (SOS)" variant="danger" onPress={() => router.push("/sos")} testID="sos-open" /> : null}

      {shift === null ? (
        <>
          <NextShiftCard slot={nextSlot ?? null} />
          <TodayStrip jobs={done.length} summary={today} />
        </>
      ) : null}

      <DocumentWarning c={compliance} />

      <StopPlan jobs={active} me={me} />

      {idle ? (
        <EmptyState
          testID="jobs-empty"
          sticker="kask"
          rotation={-8}
          title="Yol açık, iş yok."
          body="Yeni iş gelince telefonunuz titrer."
          action={
            busyArea.h > 0
              ? { label: "Yoğun bölgeleri gör", variant: "dark", testID: "busy-areas-jump", onPress: () => scrollRef.current?.scrollTo({ y: Math.max(0, busyArea.y - 8), animated: true }) }
              : undefined
          }
        />
      ) : null}
      {idle ? (
        <View onLayout={(e) => setBusyArea({ y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}>
          <BusyAreas me={me} />
        </View>
      ) : null}

      {active.length ? <Title>Aktif işler ({active.length})</Title> : null}
      {active.map((j) => (
        <Pressable key={j.id} onPress={() => router.push({ pathname: "/is/[id]", params: { id: j.id } })} testID={`job-${j.orderNo}`}>
          <Card style={{ gap: 6, borderColor: j.urgent ? colors.ink : "transparent", borderWidth: 2 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Txt weight="extrabold" size={16}>
                {j.orderNo}
                {j.urgent ? "  ⚡ ACİL" : ""}
              </Txt>
              <StatusBadge status={j.status} />
            </View>
            <Txt numberOfLines={2}>↑ {j.pickupAddress}</Txt>
            <Txt numberOfLines={2}>↓ {j.dropoffAddress}</Txt>
          </Card>
        </Pressable>
      ))}

      {done.length ? (
        <>
          <Title>Bugün tamamlanan ({done.length})</Title>
          {done.map((j) => (
            <Card key={j.id} style={{ gap: 4 }}>
              <Txt weight="bold">
                {j.orderNo} · {ORDER_STATUS_LABELS[j.status]}
              </Txt>
              <Muted>{j.dropoffAddress}</Muted>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
