import { slotLabel, WEEKDAY_LABELS } from "@yazgan/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useState, type ReactElement } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BigTitle, HandTag } from "@/components/Neo";
import { Sticker } from "@/components/Sticker";
import { Button, Card, ErrorBox, Muted, Txt, colors, radii, type } from "@/components/ui";
import { api, ApiError, type ShiftSlot } from "@/lib/api";

const todayIst = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const dayTitle = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = ((d.getUTCDay() + 6) % 7) + 1;
  return `${WEEKDAY_LABELS[dow]} · ${d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "UTC" })}`;
};

/**
 * Kuryenin en çok gerektiği tek dilim (ekran başına tek limon "Al"): alınabilir dilimler içinde
 * en çok kurye isteyen (yoğun saat), sonra en büyük açık, sonra en erken.
 */
function neediest(slots: ShiftSlot[], now: number): string | null {
  const open = slots.filter((s) => !s.mine && s.booked < s.required && new Date(s.startsAt).getTime() > now);
  open.sort((a, b) => b.required - a.required || b.required - b.booked - (a.required - a.booked) || a.startsAt.localeCompare(b.startsAt));
  const top = open[0];
  // Tek kişilik dilimler "yoğun" sayılmaz
  return top && top.required >= 2 ? top.startsAt : null;
}

/** Kurye vardiya planı: önümüzdeki 14 günün dilimlerinden seçer; dolu dilim alınamaz */
export default function Vardiyam() {
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setSlots(await api.listShiftSlots(todayIst(), 14));
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Vardiyalar yüklenemedi");
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function toggle(s: ShiftSlot) {
    setBusy(s.startsAt);
    setError(null);
    setMsg(null);
    try {
      if (s.mine && s.bookingId) {
        const r = await api.cancelShiftBooking(s.bookingId);
        setMsg(r.lateCancel ? "Vardiya bırakıldı (2 saatten az kala: geç iptal olarak kaydedildi)" : "Vardiya bırakıldı");
      } else {
        await api.bookShift(s.templateId, s.day);
        setMsg(`${dayTitle(s.day)} ${slotLabel(s.startsAt, s.endsAt)} vardiyası alındı`);
      }
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İşlem başarısız");
    } finally {
      setBusy(null);
    }
  }

  const upcoming = slots.filter((s) => new Date(s.endsAt).getTime() > now);
  const mine = upcoming.filter((s) => s.mine);
  const hours = mine.reduce((t, s) => t + (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 3_600_000, 0);
  const days = [...new Set(upcoming.map((s) => s.day))];
  const hot = neediest(upcoming, now);

  // ScrollView'in doğrudan çocukları: [başlık, (gün başlığı, gün kartı)…] — gün başlıkları yapışkan
  const children: ReactElement[] = [
    <View key="head" style={{ gap: 14, marginBottom: 4 }}>
      <View style={{ marginTop: 6 }}>
        <BigTitle size={52}>Vardiyam.</BigTitle>
        <Sticker name="kronometre" size={58} rotation={10} style={{ position: "absolute", right: 8, top: -10 }} />
      </View>
      <Card style={{ gap: 4 }}>
        <Txt style={type.label}>PLANIM · 14 GÜN</Txt>
        <Txt testID="my-shift-summary" weight="black" size={22} style={{ letterSpacing: -0.6, lineHeight: 27 }}>
          {mine.length ? `${mine.length} vardiya · ${hours.toLocaleString("tr-TR")} saat (14 gün)` : "Henüz vardiya seçmediniz."}
        </Txt>
        <Muted>Seçtiğiniz saatlerde vardiyayı başlatın; 1 saat önce hatırlatılır. Başlangıca 2 saatten az kala bırakmak geç iptal sayılır.</Muted>
      </Card>
      <ErrorBox message={error} />
      {msg ? (
        <Txt weight="bold" color={colors.success}>
          {msg}
        </Txt>
      ) : null}
    </View>,
  ];
  const sticky: number[] = [];
  for (const day of days) {
    sticky.push(children.length);
    children.push(
      <View key={`h-${day}`} style={{ backgroundColor: colors.bg, paddingTop: 10, paddingBottom: 8 }}>
        <View style={{ alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 7 }}>
          <Txt weight="extrabold" size={13} color="#fff" style={{ letterSpacing: 0.3 }}>
            {dayTitle(day)}
          </Txt>
        </View>
      </View>,
    );
    children.push(
      <Card key={`c-${day}`} style={{ gap: 0, paddingVertical: 6 }}>
        {upcoming
          .filter((s) => s.day === day)
          .map((s, i) => {
            const full = !s.mine && s.booked >= s.required;
            const started = new Date(s.startsAt).getTime() <= now;
            const isHot = s.startsAt === hot;
            return (
              <View
                key={s.startsAt}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.bg }}
                testID={`slot-${day}-${slotLabel(s.startsAt, s.endsAt)}`}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Txt weight={s.mine ? "black" : "extrabold"} size={16} style={{ fontVariant: ["tabular-nums"] }}>
                      {slotLabel(s.startsAt, s.endsAt)}
                    </Txt>
                    {isHot ? (
                      <HandTag rotate={-6} style={{ marginVertical: -6 }}>
                        yoğun saat
                      </HandTag>
                    ) : null}
                  </View>
                  <Txt size={13} color={s.mine ? colors.ink : colors.muted} weight={s.mine ? "bold" : "semibold"}>
                    {s.mine ? "✓ sizin · " : ""}
                    {s.booked}/{s.required} kurye
                  </Txt>
                </View>
                <View style={{ width: 104 }}>
                  <Button
                    title={s.mine ? "Bırak" : full ? "Dolu" : "Al"}
                    variant={isHot ? "primary" : "secondary"}
                    disabled={full || started || busy !== null}
                    loading={busy === s.startsAt}
                    onPress={() => toggle(s)}
                  />
                </View>
              </View>
            );
          })}
      </Card>,
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "left", "right"]}>
      <ScrollView stickyHeaderIndices={sticky} contentContainerStyle={{ padding: 14, paddingTop: 14 }}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
