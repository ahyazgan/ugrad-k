import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Muted, colors, font } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { outbox, useOutbox } from "@/lib/outbox";
import { taskLabel } from "@/lib/outbox-core";

/** Çevrimdışı kuyruk durumu: bekleyen işlemler, gönderilemeyenler */
export function OutboxBanner({ onSent }: { onSent?: () => void }) {
  const { pending, locations, failed } = useOutbox();
  const [busy, setBusy] = useState(false);
  if (!pending.length && !failed.length) return null;

  async function retry() {
    setBusy(true);
    try {
      const r = await outbox.flush();
      if (r.sent) onSent?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 6, borderColor: failed.length ? colors.danger : colors.accent, backgroundColor: failed.length ? colors.dangerLight : "#FEF3C7" }}>
      {pending.length ? (
        <>
          <Text style={{ ...font("extrabold") }} testID="outbox-pending">
            📶 Bağlantı yok: {pending.length} işlem bekliyor
          </Text>
          {pending.map((i) => (
            <Muted key={i.id}>
              {taskLabel(i.task)} · {formatTime(i.at)}
            </Muted>
          ))}
          <Muted>
            Bağlantı gelince yapıldıkları saatle otomatik gönderilir{locations ? ` (${locations} konum noktası da)` : ""}.
          </Muted>
        </>
      ) : null}
      {failed.map((i) => (
        <View key={i.id} style={{ gap: 4 }}>
          <Text style={{ color: colors.danger, ...font("extrabold") }}>
            Gönderilemedi: {taskLabel(i.task)} ({formatTime(i.at)})
          </Text>
          <Muted>{i.error}</Muted>
          <Button title="Bu işlemi sil" variant="secondary" onPress={() => outbox.discard(i.id)} />
        </View>
      ))}
      {pending.length ? <Button title="Şimdi dene" variant="secondary" onPress={retry} loading={busy} testID="outbox-retry" /> : null}
    </Card>
  );
}
