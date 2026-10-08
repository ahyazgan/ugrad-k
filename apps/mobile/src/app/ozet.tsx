import { formatTL } from "@yazgan/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BigTitle, HandTag, InkChip, InkPillBar, RouteCard, RouteStop } from "@/components/Neo";
import { Card, ErrorBox, Loading, Muted, Row, Screen, Title, colors, font, radii } from "@/components/ui";
import { api, ApiError, type OrderInput, type QuoteResponse } from "@/lib/api";
import { draftToInput, useOrderDraft } from "@/lib/order-draft";
import { payOrder } from "@/lib/payment";
import { useSession } from "@/lib/session";

const PAYMENT_OPTIONS: { value: OrderInput["paymentMethod"]; label: string; hint: string; corporateOnly?: boolean; disabled?: boolean }[] = [
  { value: "nakit", label: "Kuryeye ödeme", hint: "Nakit veya IBAN ile teslimatta" },
  { value: "cari", label: "Cari hesap", hint: "Ay sonu tek fatura", corporateOnly: true },
  { value: "kart", label: "Kartla online ödeme", hint: "iyzico güvenli ödeme sayfası" },
];

export default function Ozet() {
  const { draft, update, reset } = useOrderDraft();
  const { profile } = useSession();
  const input = draftToInput(draft);
  // Teklif, hesaplandığı girdinin anahtarıyla saklanır; girdi değişince eski teklif gösterilmez
  const key = JSON.stringify({ ...input, paymentMethod: undefined });
  const [result, setResult] = useState<{ key: string; quote?: QuoteResponse; error?: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const current = result?.key === key ? result : null;
  const quote = current?.quote ?? null;
  const error = submitError ?? current?.error ?? null;

  useEffect(() => {
    if (!input) return;
    let alive = true;
    api.quote(input).then(
      (q) => alive && setResult({ key, quote: q }),
      (e) => alive && setResult({ key, error: e instanceof ApiError ? e.message : "Fiyat hesaplanamadı" }),
    );
    return () => {
      alive = false;
    };
    // Ödeme yöntemi fiyatı etkilemez; yalnızca anahtar değişince yeniden hesapla
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function confirm() {
    if (!input) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await api.createOrder(input);
      reset();
      if (input.paymentMethod === "kart") await payOrder(order.id);
      // Özet ekranının yerine sipariş detayı: geri tuşu sekmelere döner
      router.replace({ pathname: "/siparis/[id]", params: { id: order.id, yeni: "1" } });
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : "Sipariş oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  }

  if (!input) {
    return (
      <Screen>
        <Muted>Önce adresleri seçin.</Muted>
      </Screen>
    );
  }

  const km = quote ? (quote.distanceMeters / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) : "";
  const min = quote ? Math.round(quote.durationSeconds / 60) : 0;

  return (
    <Screen>
      <InkChip>ADIM 2 / 2</InkChip>
      <View>
        <BigTitle size={54}>{"Tamam,\nson adım."}</BigTitle>
        <HandTag rotate={-10} style={{ position: "absolute", right: 4, top: 4 }}>
          {"sürpriz\nyok!"}
        </HandTag>
      </View>
      <RouteCard
        from={<RouteStop label="NEREDEN" address={input.pickup.address} details={input.pickup.details} />}
        to={<RouteStop label="NEREYE" address={input.dropoff.address} details={input.dropoff.details} />}
        footer={
          quote ? (
            <Muted>
              Sürüş mesafesi {km} km · yaklaşık {min} dk{quote.bridgeCrossings ? " · köprü geçişi" : ""}
            </Muted>
          ) : null
        }
      />

      {error ? <ErrorBox message={error} /> : null}
      {!quote && !error ? <Loading /> : null}

      {quote ? (
        <Card>
          <Title>Fiyat</Title>
          {quote.quote.lines.map((l) => (
            <Row key={l.code} label={l.label} value={formatTL(l.amountKurus)} />
          ))}
          <View style={{ height: 1, backgroundColor: colors.bg }} />
          <Row label="Ara toplam (KDV hariç)" value={formatTL(quote.quote.subtotalKurus)} />
          <Row label="KDV %20" value={formatTL(quote.quote.vatKurus)} />
          <Row label="Toplam" value={formatTL(quote.quote.totalKurus)} bold />
          {draft.paymentMethod === "cari" ? (
            <Muted>Kurumsal indiriminiz ay sonu faturanızda uygulanır.</Muted>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Title>Nasıl ödersin?</Title>
        {PAYMENT_OPTIONS.filter((o) => !o.corporateOnly || profile?.corporateAccountId).map((o) => {
          const on = draft.paymentMethod === o.value;
          return (
            <Pressable
              key={o.value}
              disabled={o.disabled}
              onPress={() => update({ paymentMethod: o.value })}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: !!o.disabled }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                backgroundColor: on ? colors.ink : colors.bg,
                borderRadius: radii.tile,
                paddingVertical: 14,
                paddingHorizontal: 16,
                opacity: o.disabled ? 0.5 : 1,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ ...font("black"), fontSize: 16, letterSpacing: -0.3, color: on ? "#fff" : colors.ink }}>{o.label}</Text>
                <Text style={{ ...font("semibold"), fontSize: 12, color: on ? colors.onInkMuted : colors.mutedDark }}>{o.hint}</Text>
              </View>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 99,
                  backgroundColor: on ? colors.lime : "transparent",
                  borderWidth: on ? 0 : 2,
                  borderColor: colors.ink,
                }}
              />
            </Pressable>
          );
        })}
      </Card>

      <InkPillBar
        caption="TOPLAM · KDV DAHİL"
        title={quote ? formatTL(quote.quote.totalKurus) : "—"}
        action="Onayla"
        accessibilityLabel="Siparişi onayla"
        onPress={confirm}
        loading={submitting}
        disabled={!quote}
        testID="confirm-order"
      />
      <Muted style={{ textAlign: "center" }}>
        Bekleme süresi 15 dakikayı aşarsa her 10 dakika için 50 TL + KDV eklenir.
      </Muted>
    </Screen>
  );
}
