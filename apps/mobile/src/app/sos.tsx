import { INCIDENT_KINDS, type IncidentKind } from "@yazgan/shared";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import { Button, Card, ErrorBox, Muted, Screen, Title, colors, styles, font } from "@/components/ui";
import { api, ApiError, type Incident } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { currentPosition, lastKnownPosition } from "@/lib/location";
import { outbox } from "@/lib/outbox";

/**
 * Acil durum: kurye tür seçip tek tuşla yöneticiye konumuyla alarm verir. Hayati tehlikede önce 112.
 * Alarm verilince kurye molaya alınır (yeni iş gelmez); yönetici "gördüm" deyince burada görünür.
 */
export default function Sos() {
  const [kind, setKind] = useState<IncidentKind | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);
  const [offline, setOffline] = useState(false);

  const load = useCallback(() => api.myOpenIncident().then(setIncident, () => setIncident(null)), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [load]);

  async function send() {
    const k = kind ?? incident?.kind;
    if (!k) return;
    setBusy(true);
    setError(null);
    try {
      // Hızlı olsun: önce son bilinen konum, yoksa anlık konum
      const at = (await lastKnownPosition()) ?? (await currentPosition());
      // Bağlantı yoksa alarm telefonda bekler ve bağlantı gelir gelmez gider
      const r = await outbox.run([{ kind: "sos", incident: k, note: note.trim() || null, loc: at }]);
      setOffline(r === "queued");
      if (r === "sent") await load();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Gönderilemedi; yöneticinizi telefonla arayın");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card style={{ borderColor: colors.danger, backgroundColor: colors.dangerLight, gap: 8 }}>
        <Text style={{ ...font("black"), fontSize: 16, color: colors.danger }}>Hayati tehlike varsa önce 112&apos;yi arayın</Text>
        <Button title="112 Acil Çağrı" variant="danger" onPress={() => Linking.openURL("tel:112")} testID="call-112" />
      </Card>

      {offline ? (
        <Card style={{ borderColor: colors.danger }}>
          <Text testID="sos-offline" style={{ color: colors.danger, ...font("black") }}>
            İnternet yok! Alarm telefonda bekliyor, bağlantı gelir gelmez gönderilecek. Şimdi 112&apos;yi veya yöneticinizi telefonla arayın.
          </Text>
        </Card>
      ) : null}
      {incident ? (
        <Card style={{ gap: 6 }}>
          <Title>Bildirildi</Title>
          <Text testID="sos-status">
            {INCIDENT_KINDS[incident.kind]} · {formatTime(incident.createdAt)} · konumunuz yöneticiye gönderildi.
          </Text>
          {incident.acknowledgedAt ? (
            <Text testID="sos-acknowledged" style={{ color: colors.success, ...font("extrabold") }}>
              ✓ Yönetici gördü ({formatTime(incident.acknowledgedAt)}); sizi arayacak.
            </Text>
          ) : (
            <Muted>Yönetici görene kadar alarm birkaç dakikada bir tekrarlanır.</Muted>
          )}
          <Muted>Molaya alındınız; yeni iş gelmez. Durum çözülünce İşlerim ekranından &quot;Moladan dön&quot;e basın.</Muted>
          <Button title="Konumumu yeniden gönder" variant="secondary" onPress={send} loading={busy} disabled={!kind && !incident} />
        </Card>
      ) : (
        <Card style={{ gap: 10 }}>
          <Title>Ne oldu?</Title>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(Object.keys(INCIDENT_KINDS) as IncidentKind[]).map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                testID={`sos-kind-${k}`}
                style={{
                  borderWidth: 2,
                  borderColor: kind === k ? colors.danger : colors.border,
                  backgroundColor: kind === k ? colors.dangerLight : colors.card,
                  borderRadius: 999,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
              >
                <Text style={font(kind === k ? "extrabold" : "medium")}>{INCIDENT_KINDS[k]}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Kısa not (isteğe bağlı)" maxLength={500} multiline />
          <Button title="Yöneticiye acil durum bildir" variant="danger" onPress={send} loading={busy} disabled={!kind || incident === undefined} testID="sos-send" />
          <Muted>Konumunuz ve elinizdeki iş yöneticiye hemen WhatsApp/SMS ile gider.</Muted>
        </Card>
      )}
      <ErrorBox message={error} />
    </Screen>
  );
}
