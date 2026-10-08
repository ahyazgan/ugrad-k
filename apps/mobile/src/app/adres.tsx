import { randomUUID } from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { PlaceDetails, PlaceSuggestion } from "@yazgan/shared";
import { Button, Card, ErrorBox, Field, Muted, Screen, colors } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useOrderDraft } from "@/lib/order-draft";

export default function AdresSec() {
  const { target } = useLocalSearchParams<{ target: "pickup" | "dropoff" }>();
  const { draft, update } = useOrderDraft();
  const current = target === "pickup" ? draft.pickup : draft.dropoff;
  // Google Places oturum belirteci: arama + detay tek oturum olarak faturalanır
  const sessionToken = useMemo(() => randomUUID(), []);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [selected, setSelected] = useState<PlaceDetails | null>(null);
  const [details, setDetails] = useState(current?.details ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 3) return;
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        setItems(await api.searchPlaces(query, sessionToken));
        setError(null);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Adres aranamadı");
      } finally {
        setLoading(false);
      }
    }, 350);
  }, [query, sessionToken]);

  async function pick(s: PlaceSuggestion) {
    setLoading(true);
    try {
      setSelected(await api.placeDetails(s.placeId, sessionToken));
      setItems([]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Adres alınamadı");
    } finally {
      setLoading(false);
    }
  }

  function save() {
    if (!selected) return;
    const point = {
      address: selected.address,
      lat: selected.lat,
      lng: selected.lng,
      district: selected.district,
      details: details.trim() || undefined,
    };
    update(target === "pickup" ? { pickup: point } : { dropoff: point });
    router.back();
  }

  return (
    <Screen>
      <Field
        label={target === "pickup" ? "Alış adresi" : "Teslim adresi"}
        placeholder="Mahalle, cadde, iş yeri adı…"
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          setSelected(null);
        }}
        autoFocus
        testID="address-search"
      />
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      <ErrorBox message={error} />
      {items.length > 0 && query.trim().length >= 3 ? (
        <Card style={{ padding: 0, gap: 0 }}>
          {items.map((s, i) => (
            <Pressable
              key={s.placeId}
              onPress={() => pick(s)}
              testID={`suggestion-${i}`}
              style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderColor: colors.border }}
            >
              <Text style={{ fontWeight: "600" }}>{s.title}</Text>
              <Muted>{s.subtitle}</Muted>
            </Pressable>
          ))}
        </Card>
      ) : null}
      {selected ? (
        <Card>
          <Text style={{ fontWeight: "700" }}>{selected.address}</Text>
          <Muted>
            {selected.district ? `${selected.district} · ` : ""}
            {selected.side === "avrupa" ? "Avrupa yakası" : "Anadolu yakası"}
          </Muted>
          <Field
            label="Adres tarifi"
            placeholder="Bina no, kat, daire, firma adı"
            value={details}
            onChangeText={setDetails}
            testID="address-details"
          />
          <Button title="Bu adresi kullan" onPress={save} testID="address-save" />
        </Card>
      ) : null}
      {!selected && query.length < 3 ? <Muted>En az 3 harf yazın.</Muted> : null}
      <View style={{ height: 24 }} />
    </Screen>
  );
}
