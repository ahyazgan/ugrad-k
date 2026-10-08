import { formatTL } from "@yazgan/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { StatusBadge } from "@/components/StatusBadge";
import { SafeAreaView } from "react-native-safe-area-context";
import { BigTitle, EmptyState, InkChip } from "@/components/Neo";
import { Sticker } from "@/components/Sticker";
import { Card, ErrorBox, Muted, colors, font, styles } from "@/components/ui";
import { api, ApiError, type OrderSummary } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export default function Siparisler() {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders(await api.listOrders());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Siparişler yüklenemedi");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const active = orders?.filter((o) => !["teslim_edildi", "iptal"].includes(o.status)).length ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "left", "right"]}>
      <FlatList
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 14, gap: 10 }}
        data={orders ?? []}
        keyExtractor={(o) => o.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <BigTitle size={52}>Siparişlerim.</BigTitle>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 }}>
              {orders && active ? <InkChip>{`AKTİF · ${active}`}</InkChip> : <View />}
              {/* Liste boşken çıkartma boş durum kartında; başlıkta ikinci kez gösterilmez */}
              {orders?.length ? <Sticker name="kutu" size={76} rotation={-6} style={{ marginVertical: -16, marginRight: 6 }} /> : null}
            </View>
            <ErrorBox message={error} />
          </View>
        }
        ListEmptyComponent={
          orders ? (
            <EmptyState
              testID="orders-empty"
              sticker="kutu"
              rotation={-6}
              title="Henüz sipariş yok."
              body="İlk gönderini 1 dakikada oluştur."
              action={{ label: "Yeni sipariş", onPress: () => router.navigate("/(musteri)"), testID: "orders-empty-new" }}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: "/siparis/[id]", params: { id: item.id } })}>
            <Card style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ ...font("black"), fontSize: 17, color: colors.ink }}>
                  {item.orderNo}
                  {item.urgent ? "  ⚡" : ""}
                </Text>
                <StatusBadge status={item.status} />
              </View>
              <Muted>{formatDateTime(item.createdAt)}</Muted>
              <Text style={styles.body} numberOfLines={1}>↑ {item.pickupAddress}</Text>
              <Text style={styles.body} numberOfLines={1}>↓ {item.dropoffAddress}</Text>
              <Text style={{ ...font("black"), fontSize: 17, letterSpacing: -0.3, color: colors.ink, textAlign: "right" }}>{formatTL(item.totalKurus)}</Text>
            </Card>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
