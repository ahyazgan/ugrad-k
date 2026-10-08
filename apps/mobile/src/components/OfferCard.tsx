import { OFFER_DECLINE_REASONS, offerSecondsLeft, roadKm } from "@yazgan/shared";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, Vibration, View } from "react-native";
import { Button, Card, ErrorBox, Muted, colors } from "@/components/ui";
import { api, ApiError, type OrderSummary } from "@/lib/api";

/**
 * Yanıt bekleyen iş teklifi: geri sayım, kabul / ret (nedenle). Süre bitince teklif kendiliğinden
 * reddedilir (sunucu da her dakika süresi dolanları geri alır). Yeni teklifte telefon titrer.
 */
export function OfferCard({
  job,
  me,
  onDone,
}: {
  job: OrderSummary & { offerExpiresAt: string };
  me: { lat: number; lng: number } | null;
  onDone: (message: string | null) => void;
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
  const urgentColor = job.urgent ? colors.accent : colors.primary;

  return (
    <Card style={{ gap: 8, borderColor: urgentColor, borderWidth: 2 }}>
      <View testID={`offer-${job.orderNo}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontWeight: "800", fontSize: 16, color: urgentColor }}>{job.urgent ? "⚡ ACİL iş teklifi" : "🔔 Yeni iş teklifi"}</Text>
        <Text
          testID="offer-countdown"
          style={{ fontWeight: "800", fontSize: 18, color: left <= 15 ? colors.danger : colors.text, fontVariant: ["tabular-nums"] }}
        >
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </Text>
      </View>
      <Text style={{ fontWeight: "700" }}>{job.orderNo}</Text>
      <Text numberOfLines={2}>↑ {job.pickupAddress}</Text>
      <Text numberOfLines={2}>↓ {job.dropoffAddress}</Text>
      <Muted>
        {[toPickup != null ? `Alışa ~${toPickup.toLocaleString("tr-TR")} km` : null, route != null ? `teslimat ~${route.toLocaleString("tr-TR")} km` : null]
          .filter(Boolean)
          .join(" · ") || "Mesafe hesaplanıyor"}
      </Muted>
      <ErrorBox message={error} />
      {declining ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "600" }}>Neden reddediyorsunuz?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {OFFER_DECLINE_REASONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => respond(false, { reason: r })}
                disabled={busy}
                testID={`decline-reason-${r}`}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
              >
                <Text>{r}</Text>
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
            <Button title="Kabul et" onPress={() => respond(true)} loading={busy} testID="offer-accept" />
          </View>
        </View>
      )}
    </Card>
  );
}
