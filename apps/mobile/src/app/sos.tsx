import { INCIDENT_KINDS, type IncidentKind } from "@yazgan/shared";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, TextInput, View } from "react-native";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, Card, Checkbox, ErrorBox, Muted, Screen, Title, Txt, colors, radii, styles, type } from "@/components/ui";
import { api, ApiError, type Incident, type OrderSummary } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { currentPosition, lastKnownPosition, startTracking } from "@/lib/location";
import { callPhone } from "@/lib/navigation";
import { outbox } from "@/lib/outbox";
import { DISPATCH_PHONE } from "@/lib/support";

const HELD = ["kuryeye_atandi", "alindi", "yolda", "sorunlu", "geri_donuyor"];

/** Bildirimden sonra yapılacaklar (yalnız yerel; sunucuya gönderilmez) */
const CHECKLIST = [
  { key: "safe", title: "Güvenli yere çekil", hint: "Trafikten uzak, görünür bir yerde durun." },
  { key: "package", title: "Paket yanında", hint: "Paketi araçta veya gözetimsiz bırakmayın." },
  { key: "photo", title: "Fotoğraf çek", hint: "Hasarı ve olay yerini çekin; sigorta için gerekir." },
] as const;

/**
 * Acil durum: kurye tür seçip tek tuşla yöneticiye konumuyla alarm verir. Hayati tehlikede önce 112.
 * Alarm verilince kurye molaya alınır (yeni iş gelmez); yönetici "gördüm" deyince burada görünür.
 * Ciddiyet gereği bu ekranda çıkartma/süs kullanılmaz.
 */
export default function Sos() {
  const [kind, setKind] = useState<IncidentKind | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incident, setIncident] = useState<Incident | null | undefined>(undefined);
  const [offline, setOffline] = useState(false);
  const [jobs, setJobs] = useState<OrderSummary[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [callInfo, setCallInfo] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const load = useCallback(() => api.myOpenIncident().then(setIncident, () => setIncident(null)), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [load]);
  // Elindeki iş: yöneticiyle konuşurken sipariş no ve adresler el altında olsun
  useEffect(() => {
    api.listCourierJobs().then((j) => setJobs(j.filter((x) => HELD.includes(x.status) && !x.offerExpiresAt)), () => undefined);
  }, [incident?.id]);

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

  function callManager() {
    setCallInfo(null);
    if (DISPATCH_PHONE) callPhone(DISPATCH_PHONE);
    else setCallInfo("Demo modunda arama yapılmaz.");
  }

  /** Sorun çözüldü: moladan çıkar, konum paylaşımını sürdürür. Kaydı yönetici kapatır. */
  async function resolved() {
    setResolving(true);
    setError(null);
    try {
      const s = await api.getOpenShift();
      if (s?.break) {
        await api.endBreak();
        await startTracking();
      }
      if (router.canGoBack()) router.back();
      else router.replace("/(kurye)");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İşlem başarısız; yöneticinizi arayın");
    } finally {
      setResolving(false);
    }
  }

  const canCall = !!DISPATCH_PHONE || api.mode === "demo";

  return (
    <Screen>
      <Card style={{ backgroundColor: colors.dangerLight, gap: 8 }}>
        <Txt weight="black" size={16} color={colors.danger}>
          Hayati tehlike varsa önce 112&apos;yi arayın
        </Txt>
        <Button title="112 Acil Çağrı" variant="danger" onPress={() => Linking.openURL("tel:112")} testID="call-112" />
      </Card>

      {offline ? (
        <Card style={{ borderColor: colors.danger, borderWidth: 2 }}>
          <Txt testID="sos-offline" weight="black" color={colors.danger}>
            İnternet yok! Alarm telefonda bekliyor, bağlantı gelir gelmez gönderilecek. Şimdi 112&apos;yi veya yöneticinizi telefonla arayın.
          </Txt>
        </Card>
      ) : null}
      {incident ? (
        <>
          <Card style={{ gap: 8 }}>
            <Title>Bildirildi</Title>
            <Txt testID="sos-status" weight="bold" size={15}>
              {INCIDENT_KINDS[incident.kind]} · {formatTime(incident.createdAt)} · konumunuz yöneticiye gönderildi.
            </Txt>
            {incident.acknowledgedAt ? (
              <Txt testID="sos-acknowledged" weight="extrabold" color={colors.success}>
                ✓ Yönetici gördü ({formatTime(incident.acknowledgedAt)}); sizi arayacak.
              </Txt>
            ) : (
              <Muted>Yönetici görene kadar alarm birkaç dakikada bir tekrarlanır.</Muted>
            )}
            <Muted>Molaya alındınız; yeni iş gelmez.</Muted>
          </Card>

          {canCall ? (
            <Button title="Yöneticiyi ara" variant="dark" onPress={callManager} testID="sos-call-manager" />
          ) : (
            <Muted style={{ textAlign: "center" }}>Yöneticinizi kayıtlı numarasından arayın.</Muted>
          )}
          {callInfo ? <Muted style={{ textAlign: "center" }}>{callInfo}</Muted> : null}

          {jobs.map((j) => (
            <Pressable
              key={j.id}
              testID={`sos-job-${j.orderNo}`}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/is/[id]", params: { id: j.id } })}
            >
              <Card style={{ gap: 6 }}>
                <Txt style={type.label}>ELİNİZDEKİ İŞ</Txt>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Txt weight="black" size={17}>
                    {j.orderNo}
                    {j.urgent ? "  ⚡" : ""}
                  </Txt>
                  <StatusBadge status={j.status} />
                </View>
                <Txt numberOfLines={1}>↑ {j.pickupAddress}</Txt>
                <Txt numberOfLines={1}>↓ {j.dropoffAddress}</Txt>
              </Card>
            </Pressable>
          ))}

          <Card style={{ gap: 12 }}>
            <Txt style={type.label}>ŞİMDİ</Txt>
            {CHECKLIST.map((c) => (
              <Checkbox key={c.key} checked={!!checked[c.key]} onChange={(v) => setChecked((x) => ({ ...x, [c.key]: v }))}>
                <Txt weight="extrabold" size={15}>
                  {c.title}
                </Txt>
                <Muted>{c.hint}</Muted>
              </Checkbox>
            ))}
          </Card>

          <Button title="Konumumu yeniden gönder" variant="secondary" onPress={send} loading={busy} disabled={!kind && !incident} />
          <View style={{ gap: 6, marginTop: 4 }}>
            <Button title="Sorun çözüldü" variant="secondary" onPress={resolved} loading={resolving} testID="sos-resolved" />
            <Muted style={{ textAlign: "center" }}>Moladan çıkarsınız ve yeni iş almaya başlarsınız. Kaydı yönetici kapatır.</Muted>
          </View>
        </>
      ) : (
        <Card style={{ gap: 10 }}>
          <Title>Ne oldu?</Title>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup">
            {(Object.keys(INCIDENT_KINDS) as IncidentKind[]).map((k) => {
              const on = kind === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  testID={`sos-kind-${k}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={{
                    borderWidth: 2,
                    borderColor: on ? colors.danger : colors.border,
                    backgroundColor: on ? colors.dangerLight : colors.surface,
                    borderRadius: radii.pill,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                  }}
                >
                  <Txt weight={on ? "extrabold" : "bold"} color={on ? colors.danger : colors.ink}>
                    {INCIDENT_KINDS[k]}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="Kısa not (isteğe bağlı)"
            placeholderTextColor={colors.muted}
            maxLength={500}
            multiline
          />
          <Button title="Yöneticiye acil durum bildir" variant="danger" onPress={send} loading={busy} disabled={!kind || incident === undefined} testID="sos-send" />
          <Muted>Konumunuz ve elinizdeki iş yöneticiye hemen WhatsApp/SMS ile gider.</Muted>
        </Card>
      )}
      <ErrorBox message={error} />
    </Screen>
  );
}
