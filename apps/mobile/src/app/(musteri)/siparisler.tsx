import { formatTL } from "@yazgan/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, ErrorBox, Muted, colors } from "@/components/ui";
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

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
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
      ListHeaderComponent={<ErrorBox message={error} />}
      ListEmptyComponent={orders ? <Muted style={{ textAlign: "center", marginTop: 32 }}>Henüz siparişiniz yok.</Muted> : null}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push({ pathname: "/siparis/[id]", params: { id: item.id } })}>
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "700" }}>
                {item.orderNo}
                {item.urgent ? "  ⚡" : ""}
              </Text>
              <StatusBadge status={item.status} />
            </View>
            <Muted>{formatDateTime(item.createdAt)}</Muted>
            <Text numberOfLines={1}>↑ {item.pickupAddress}</Text>
            <Text numberOfLines={1}>↓ {item.dropoffAddress}</Text>
            <Text style={{ fontWeight: "600", textAlign: "right" }}>{formatTL(item.totalKurus)}</Text>
          </Card>
        </Pressable>
      )}
    />
  );
}
