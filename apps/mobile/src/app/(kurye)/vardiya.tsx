import { slotLabel, WEEKDAY_LABELS } from "@yazgan/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, ErrorBox, Muted, Screen, Title, colors, font } from "@/components/ui";
import { api, ApiError, type ShiftSlot } from "@/lib/api";

const todayIst = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const dayTitle = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = ((d.getUTCDay() + 6) % 7) + 1;
  return `${WEEKDAY_LABELS[dow]} · ${d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "UTC" })}`;
};

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

  return (
    <Screen>
      <Card style={{ gap: 4 }}>
        <Title>Vardiya planım</Title>
        <Text testID="my-shift-summary">
          {mine.length ? `${mine.length} vardiya · ${hours.toLocaleString("tr-TR")} saat (14 gün)` : "Henüz vardiya seçmediniz."}
        </Text>
        <Muted>Seçtiğiniz saatlerde vardiyayı başlatın; 1 saat önce hatırlatılır. Başlangıca 2 saatten az kala bırakmak geç iptal sayılır.</Muted>
      </Card>
      <ErrorBox message={error} />
      {msg ? <Muted style={{ color: colors.success }}>{msg}</Muted> : null}
      {days.map((day) => (
        <Card key={day} style={{ gap: 6 }}>
          <Text style={{ ...font("extrabold") }}>{dayTitle(day)}</Text>
          {upcoming
            .filter((s) => s.day === day)
            .map((s) => {
              const full = !s.mine && s.booked >= s.required;
              const started = new Date(s.startsAt).getTime() <= now;
              return (
                <View key={s.startsAt} style={{ flexDirection: "row", alignItems: "center", gap: 8 }} testID={`slot-${day}-${slotLabel(s.startsAt, s.endsAt)}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...font(s.mine ? "extrabold" : "medium"), color: s.mine ? colors.primary : colors.text }}>
                      {slotLabel(s.startsAt, s.endsAt)}
                      {s.mine ? "  ✓ sizin" : ""}
                    </Text>
                    <Muted>
                      {s.booked}/{s.required} kurye
                    </Muted>
                  </View>
                  <View style={{ width: 110 }}>
                    <Button
                      title={s.mine ? "Bırak" : full ? "Dolu" : "Al"}
                      variant={s.mine ? "secondary" : "primary"}
                      disabled={full || started || busy !== null}
                      loading={busy === s.startsAt}
                      onPress={() => toggle(s)}
                    />
                  </View>
                </View>
              );
            })}
        </Card>
      ))}
    </Screen>
  );
}
