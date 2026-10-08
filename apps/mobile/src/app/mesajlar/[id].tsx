import Ionicons from "@expo/vector-icons/Ionicons";
import { etaAt, istanbulTime, QUICK_REPLIES, type OrderStatus } from "@yazgan/shared";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/components/Neo";
import { StatusBadge } from "@/components/StatusBadge";
import { ErrorBox, Muted, Txt, colors, font, radii, shadow } from "@/components/ui";
import { api, ApiError, type ChatMessage, type CourierPosition, type OrderDetail } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { callPhone } from "@/lib/navigation";

const WHO: Record<ChatMessage["senderRole"], string> = { musteri: "Müşteri", kurye: "Kurye", admin: "Destek" };
const LIVE: OrderStatus[] = ["kuryeye_atandi", "alindi", "yolda"];

/** Üstte sabit sipariş şeridi: sipariş no · durum · tahmini saat + "Ara" */
function OrderStrip({ order, role }: { order: OrderDetail; role: "musteri" | "kurye" }) {
  const live = LIVE.includes(order.status);
  const [pos, setPos] = useState<CourierPosition | null>(null);
  // Müşteri: tahmini saat kuryenin canlı konumuyla (sipariş ekranıyla aynı hesap)
  useEffect(() => (role === "musteri" && live ? api.watchCourierLocation(order.id, setPos) : undefined), [order.id, role, live]);
  const eta = etaAt(
    {
      status: order.status,
      pickup: { lat: order.pickupLat, lng: order.pickupLng },
      dropoff: { lat: order.dropoffLat, lng: order.dropoffLng },
      durationSeconds: order.durationSeconds,
    },
    pos,
  );
  // Kurye: paket alınana kadar göndereni, sonra alıcıyı arar. Müşteri: kuryeyi.
  const phone =
    role === "kurye"
      ? order.status === "kuryeye_atandi"
        ? order.pickupContactPhone
        : order.dropoffContactPhone
      : order.courierPhone;
  const who = role === "kurye" ? (order.status === "kuryeye_atandi" ? "göndereni" : "alıcıyı") : "kuryeyi";
  return (
    <View
      testID="chat-order-strip"
      style={{
        marginHorizontal: 14,
        marginTop: 8,
        marginBottom: 4,
        minHeight: 64,
        backgroundColor: colors.surface,
        borderRadius: radii.pill,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingLeft: 20,
        paddingRight: 8,
        paddingVertical: 8,
        ...shadow,
      }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Txt weight="black" size={16} style={{ letterSpacing: -0.3 }}>
            {order.orderNo}
          </Txt>
          <StatusBadge status={order.status} />
        </View>
        <Txt size={12} color={colors.muted} numberOfLines={1}>
          {eta ? `Tahmini teslim ${istanbulTime(eta)}` : "Teslimat tamamlandı"}
        </Txt>
      </View>
      {phone ? (
        <Pressable
          testID="chat-call"
          accessibilityRole="button"
          accessibilityLabel={`${who[0]!.toLocaleUpperCase("tr")}${who.slice(1)} ara`}
          onPress={() => callPhone(phone)}
          style={({ pressed }) => ({
            height: 48,
            paddingHorizontal: 18,
            borderRadius: radii.pill,
            backgroundColor: colors.ink,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Ionicons name="call" size={16} color="#fff" />
          <Txt weight="extrabold" size={15} color="#fff">
            Ara
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Sipariş yazışması: müşteri ↔ kurye (ve destek). Telefon numarası paylaşmadan. */
export default function Mesajlar() {
  const { id, role } = useLocalSearchParams<{ id: string; role?: "musteri" | "kurye" }>();
  const me = role === "kurye" ? "kurye" : "musteri";
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      setMessages(await api.listMessages(id));
      await api.markMessagesRead(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Mesajlar yüklenemedi");
    }
  }, [id]);

  useEffect(() => {
    api.listMessages(id).then(
      (m) => {
        setMessages(m);
        api.markMessagesRead(id).catch(() => undefined);
      },
      (e) => setError(e instanceof ApiError ? e.message : "Mesajlar yüklenemedi"),
    );
    return api.subscribeMessages(id, load);
  }, [id, load]);

  // Sipariş şeridi: durum değiştikçe güncellenir; okunamazsa şerit gösterilmez (yazışma etkilenmez)
  useEffect(() => {
    const refresh = () => api.getOrder(id).then(setOrder, () => undefined);
    refresh();
    return api.subscribeOrder(id, refresh);
  }, [id]);

  async function send(body: string) {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendMessage(id, body);
      setText("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gönderilemedi");
    } finally {
      setBusy(false);
    }
  }

  const list = messages ?? [];
  const empty = messages !== null && list.length === 0;
  const lastMine = [...list].reverse().find((m) => m.mine);
  const quick = QUICK_REPLIES[me];
  const canSend = !!text.trim() && !busy;
  const idle = !canSend && !busy;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {order ? <OrderStrip order={order} role={me} /> : null}
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ padding: 14, gap: 8 }, empty ? { flexGrow: 1, justifyContent: "center" } : null]}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        >
          {empty ? (
            <EmptyState
              testID="chat-empty"
              surface={false}
              sticker="zarf"
              stickerSize={96}
              rotation={-8}
              title="Henüz mesaj yok."
              body={me === "kurye" ? "Müşteriye hazır cevaplardan birini gönder ya da yaz." : "Kuryene hazır cevaplardan birini gönder ya da yaz."}
            >
              {/* Boşken hazır cevaplar ortada, büyük çipler */}
              <View style={{ alignSelf: "stretch", gap: 8, marginTop: 10 }}>
                {quick.map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => send(q)}
                    disabled={busy}
                    testID={`quick-${q}`}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      minHeight: 52,
                      borderRadius: radii.pill,
                      backgroundColor: pressed ? colors.primaryLight : colors.surface,
                      borderWidth: 2,
                      borderColor: colors.surface,
                      paddingHorizontal: 20,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    })}
                  >
                    <Txt weight="bold" size={16} style={{ flex: 1 }}>
                      {q}
                    </Txt>
                    <Ionicons name="arrow-up-circle" size={22} color={colors.ink} />
                  </Pressable>
                ))}
              </View>
            </EmptyState>
          ) : null}
          {list.map((m) => (
            <View
              key={m.id}
              testID={`msg-${m.mine ? "mine" : "theirs"}`}
              style={{
                alignSelf: m.mine ? "flex-end" : "flex-start",
                maxWidth: "85%",
                backgroundColor: m.mine ? colors.ink : colors.surface,
                borderRadius: 20,
                borderBottomRightRadius: m.mine ? 6 : 20,
                borderBottomLeftRadius: m.mine ? 20 : 6,
                paddingHorizontal: 14,
                paddingVertical: 9,
                gap: 2,
              }}
            >
              {!m.mine ? (
                <Txt weight="extrabold" size={11} color={colors.muted} style={{ letterSpacing: 0.4 }}>
                  {WHO[m.senderRole].toLocaleUpperCase("tr")}
                </Txt>
              ) : null}
              <Txt weight="semibold" size={15} color={m.mine ? "#fff" : colors.text}>
                {m.body}
              </Txt>
              <Txt weight="medium" size={11} color={m.mine ? colors.onInkMuted : colors.muted} style={{ textAlign: "right" }}>
                {formatTime(m.createdAt)}
                {m.mine && m === lastMine && m.readAt ? " · okundu" : ""}
              </Txt>
            </View>
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10, gap: 8 }}>
          {!empty ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
              {quick.map((q) => (
                <Pressable
                  key={q}
                  onPress={() => send(q)}
                  disabled={busy}
                  testID={`quick-${q}`}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? colors.primaryLight : colors.surface,
                    borderRadius: radii.pill,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  })}
                >
                  <Txt weight="bold" size={13}>
                    {q}
                  </Txt>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <ErrorBox message={error} />
          {/* Giriş: siyah hap çubuk + limon "Gönder" (InkPillBar dili) */}
          <View
            style={{
              minHeight: 60,
              backgroundColor: colors.ink,
              borderRadius: radii.pill,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingLeft: 20,
              paddingRight: 6,
              paddingVertical: 5,
            }}
          >
            <TextInput
              style={{ ...font("semibold"), flex: 1, fontSize: 16, color: "#fff", paddingVertical: 10, outlineWidth: 0 }}
              value={text}
              onChangeText={setText}
              placeholder="Mesaj yazın"
              placeholderTextColor={colors.onInkMuted}
              maxLength={1000}
              testID="chat-input"
              accessibilityLabel="Mesaj"
              onSubmitEditing={() => send(text)}
            />
            <Pressable
              testID="chat-send"
              accessibilityRole="button"
              accessibilityLabel="Gönder"
              accessibilityState={{ disabled: !canSend, busy }}
              disabled={!canSend}
              onPress={() => send(text)}
              style={({ pressed }) => ({
                height: 48,
                paddingHorizontal: 18,
                borderRadius: radii.pill,
                // Pasif: siyah çubukta soluk gri hap (yarı saydam limon çamurlu görünür)
                backgroundColor: idle ? colors.inkRaised : colors.lime,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Txt weight="extrabold" size={16} color={idle ? colors.onInkMuted : colors.ink}>
                Gönder
              </Txt>
              {busy ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <Ionicons name="arrow-forward" size={18} color={idle ? colors.onInkMuted : colors.ink} />
              )}
            </Pressable>
          </View>
          <Muted style={{ fontSize: 12, lineHeight: 17, textAlign: "center" }}>Telefon numaranız paylaşılmaz. Yazışmalar 90 gün saklanır.</Muted>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
