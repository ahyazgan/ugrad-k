import { QUICK_REPLIES } from "@yazgan/shared";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorBox, Muted, colors, styles } from "@/components/ui";
import { api, ApiError, type ChatMessage } from "@/lib/api";
import { formatTime } from "@/lib/format";

const WHO: Record<ChatMessage["senderRole"], string> = { musteri: "Müşteri", kurye: "Kurye", admin: "Destek" };

/** Sipariş yazışması: müşteri ↔ kurye (ve destek). Telefon numarası paylaşmadan. */
export default function Mesajlar() {
  const { id, role } = useLocalSearchParams<{ id: string; role?: "musteri" | "kurye" }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

  const lastMine = [...messages].reverse().find((m) => m.mine);
  const quick = QUICK_REPLIES[role === "kurye" ? "kurye" : "musteri"];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["bottom", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 8 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          {messages.length === 0 ? <Muted>Henüz mesaj yok. Hazır cevaplardan birini seçebilir veya yazabilirsiniz.</Muted> : null}
          {messages.map((m) => (
            <View
              key={m.id}
              testID={`msg-${m.mine ? "mine" : "theirs"}`}
              style={{
                alignSelf: m.mine ? "flex-end" : "flex-start",
                maxWidth: "85%",
                backgroundColor: m.mine ? colors.primary : colors.card,
                borderColor: colors.border,
                borderWidth: m.mine ? 0 : 1,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              {!m.mine ? <Text style={{ fontSize: 12, color: colors.muted }}>{WHO[m.senderRole]}</Text> : null}
              <Text style={{ color: m.mine ? "#fff" : colors.text, fontSize: 15 }}>{m.body}</Text>
              <Text style={{ fontSize: 11, color: m.mine ? "#DCE6F2" : colors.muted, textAlign: "right" }}>
                {formatTime(m.createdAt)}
                {m.mine && m === lastMine && m.readAt ? " · okundu" : ""}
              </Text>
            </View>
          ))}
        </ScrollView>
        <View style={{ borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12, gap: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {quick.map((q) => (
              <Pressable
                key={q}
                onPress={() => send(q)}
                disabled={busy}
                testID={`quick-${q}`}
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Text>{q}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ErrorBox message={error} />
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={text}
              onChangeText={setText}
              placeholder="Mesaj yazın"
              maxLength={1000}
              testID="chat-input"
              onSubmitEditing={() => send(text)}
            />
            <View style={{ minWidth: 96 }}>
              <Button title="Gönder" onPress={() => send(text)} loading={busy} disabled={!text.trim()} testID="chat-send" />
            </View>
          </View>
          <Muted>Telefon numaranız paylaşılmaz. Yazışmalar 90 gün saklanır.</Muted>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
