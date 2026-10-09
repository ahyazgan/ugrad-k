import { OFFER_DECLINE_REASONS, offerSecondsLeft, roadKm } from "@yazgan/shared";
import { useEffect, useRef, useState } from "react";
import { Pressable, Vibration, View } from "react-native";
import { Button, Card, ErrorBox, Muted, Txt, colors, radii } from "@/components/ui";
import { api, ApiError, type OrderSummary } from "@/lib/api";

/**
 * Yanıt bekleyen iş teklifi: geri sayım, kabul / ret (nedenle). Süre bitince teklif kendiliğinden
 * reddedilir (sunucu da her dakika süresi dolanları geri alır). Yeni teklifte telefon titrer.
 */
export function OfferCard({
  job,
  me,
  onDone,
  primary = true,
}: {
  job: OrderSummary & { offerExpiresAt: string };
  me: { lat: number; lng: number } | null;
  onDone: (message: string | null) => void;
  /** Ekranda birden çok teklif varsa yalnız ilki limon "Kabul et" alır (ekran başına ≤1 limon eylem) */
  primary?: boolean;
}) {
  const [left, setLeft] = useState(() => offerSecondsLeft(job.offerExpiresAt));
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answered = useRef(false);

  useEffect(() => {
    Vibration.vibrate([0, 600, 300, 600]);
  }, [job.id]);

  async function respond(accept: boolean, opts: { reason?: string; timeout?: boolean } = {}) {
    if (answered.current) return;
    answered.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await api.respondOffer(job.id, accept, opts);
      onDone(r.ok ? null : r.message);
    } catch (e) {
      answered.current = false;
      setError(e instanceof ApiError ? e.message : "Yanıt gönderilemedi");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      const s = offerSecondsLeft(job.offerExpiresAt);
      setLeft(s);
      if (s === 0) {
        clearInterval(timer);
        respond(false, { timeout: true });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [job.offerExpiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const toPickup = me && job.pickupPoint ? roadKm(me, job.pickupPoint) : null;
  const route = job.pickupPoint && job.dropoffPoint ? roadKm(job.pickupPoint, job.dropoffPoint) : null;
  return (
    <Card style={{ gap: 8, borderColor: job.urgent ? colors.ink : colors.border, borderWidth: 2 }}>
      <View testID={`offer-${job.orderNo}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        {job.urgent ? (
          // Limon yazı yalnız siyah zeminde
          <View style={{ backgroundColor: colors.ink, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Txt weight="black" size={13} color={colors.lime} style={{ letterSpacing: 0.6 }}>
              ⚡ ACİL İŞ TEKLİFİ
            </Txt>
          </View>
        ) : (
          <Txt weight="black" size={16}>
            🔔 Yeni iş teklifi
          </Txt>
        )}
        <Txt
          testID="offer-countdown"
          weight="black"
          size={20}
          color={left <= 15 ? colors.danger : colors.text}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </Txt>
      </View>
      <Txt weight="extrabold" size={15}>
        {job.orderNo}
      </Txt>
      <Txt numberOfLines={2}>↑ {job.pickupAddress}</Txt>
      <Txt numberOfLines={2}>↓ {job.dropoffAddress}</Txt>
      <Muted>
        {[toPickup != null ? `Alışa ~${toPickup.toLocaleString("tr-TR")} km` : null, route != null ? `teslimat ~${route.toLocaleString("tr-TR")} km` : null]
          .filter(Boolean)
          .join(" · ") || "Mesafe hesaplanıyor"}
      </Muted>
      <ErrorBox message={error} />
      {declining ? (
        <View style={{ gap: 6 }}>
          <Txt weight="bold">Neden reddediyorsunuz?</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {OFFER_DECLINE_REASONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => respond(false, { reason: r })}
                disabled={busy}
                testID={`decline-reason-${r}`}
                style={({ pressed }) => ({
                  borderWidth: 2,
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.bg : colors.surface,
                  borderRadius: radii.pill,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                })}
              >
                <Txt weight="bold">{r}</Txt>
              </Pressable>
            ))}
          </View>
          <Button title="Vazgeç" variant="secondary" onPress={() => setDeclining(false)} />
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button title="Reddet" variant="secondary" onPress={() => setDeclining(true)} disabled={busy} testID="offer-decline" />
          </View>
          <View style={{ flex: 2 }}>
            <Button title="Kabul et" variant={primary ? "primary" : "dark"} onPress={() => respond(true)} loading={busy} testID="offer-accept" />
          </View>
        </View>
      )}
    </Card>
  );
}
