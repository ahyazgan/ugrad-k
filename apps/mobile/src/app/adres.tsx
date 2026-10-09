import Ionicons from "@expo/vector-icons/Ionicons";
import { randomUUID } from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import {
  countBridgeCrossings,
  formatTL,
  resolveSide,
  sideFromDistrict,
  type IstanbulSide,
  type PlaceDetails,
  type PlaceSuggestion,
} from "@yazgan/shared";
import { BigTitle } from "@/components/Neo";
import { Sticker } from "@/components/Sticker";
import { TileMap } from "@/components/TileMap";
import { Button, Card, ErrorBox, Field, Muted, Screen, Txt, colors, font, radii, type } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { myPlace } from "@/lib/location";
import { useOrderDraft } from "@/lib/order-draft";
import { usePricingSettings } from "@/lib/pricing-settings";
import { recentPlaces, type RecentPlace } from "@/lib/recent";

const SIDE_LABEL: Record<IstanbulSide, string> = { anadolu: "Anadolu yakası", avrupa: "Avrupa yakası" };

/** Liste satırı: simge + başlık + alt satır (son adresler, konumum) */
function PlaceRow({
  icon,
  dark,
  title,
  subtitle,
  onPress,
  testID,
  first,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  dark?: boolean;
  title: string;
  subtitle?: string | null;
  onPress: () => void;
  testID?: string;
  first?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderColor: colors.bg,
        backgroundColor: pressed ? colors.bg : "transparent",
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: dark ? colors.ink : colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={19} color={dark ? colors.lime : colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt weight="bold" size={15} numberOfLines={2}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt size={13} color={colors.muted} numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.inactive} />
    </Pressable>
  );
}

export default function AdresSec() {
  const { target } = useLocalSearchParams<{ target: "pickup" | "dropoff" }>();
  const { draft, update } = useOrderDraft();
  const pricing = usePricingSettings();
  const current = target === "pickup" ? draft.pickup : draft.dropoff;
  const other = target === "pickup" ? draft.dropoff : draft.pickup;
  // Google Places oturum belirteci: arama + detay tek oturum olarak faturalanır
  const sessionToken = useMemo(() => randomUUID(), []);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [selected, setSelected] = useState<PlaceDetails | null>(null);
  /** Konumdan seçildi ama adres çözülemedi (web): adres tarifi zorunlu */
  const [approximate, setApproximate] = useState(false);
  const [details, setDetails] = useState(current?.details ?? "");
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentPlace[]>([]);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Son adresler: geçmiş siparişlerden (okunamazsa liste gizlenir)
  useEffect(() => {
    api.listOrders().then((o) => setRecent(recentPlaces(o, 5)), () => setRecent([]));
  }, []);

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
      setApproximate(false);
      setItems([]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Adres alınamadı");
    } finally {
      setLoading(false);
    }
  }

  function pickRecent(p: RecentPlace, i: number) {
    setError(null);
    setApproximate(false);
    setSelected({ placeId: `recent-${i}`, address: p.address, lat: p.lat, lng: p.lng, district: p.district, side: p.side });
  }

  async function useMyLocation() {
    setError(null);
    setLocating(true);
    try {
      const p = await myPlace();
      const district = sideFromDistrict(p.district) ? p.district : null;
      setSelected({ placeId: "my-location", address: p.address, lat: p.lat, lng: p.lng, district, side: resolveSide(p, district) });
      setApproximate(!p.exact);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Konum alınamadı. Adresi arayarak seçebilirsiniz.");
    } finally {
      setLocating(false);
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

  // Köprü ipucu: alış veya teslimden biri Avrupa yakasındaysa 1 ücretli geçiş (geo.ts); tutar fiyat ayarından
  const otherSide = other ? resolveSide(other, other.district) : null;
  const crossings = selected ? countBridgeCrossings(selected.side, otherSide ?? "anadolu") : 0;
  const bridgeFee = `+${formatTL(crossings * pricing.bridgeFeeKurus)}`;
  const sideHint = !selected
    ? null
    : selected.side === "avrupa"
      ? `${SIDE_LABEL.avrupa} · köprü geçişi ${bridgeFee}`
      : crossings
        ? `Diğer adres Avrupa'da · köprü geçişi ${bridgeFee}`
        : `${SIDE_LABEL.anadolu} · köprü geçişi yok`;
  const browsing = !selected && query.trim().length < 3;
  const needsDetails = approximate && details.trim().length < 5;

  return (
    <Screen>
      <View style={{ minHeight: 64, justifyContent: "center", marginTop: 2 }}>
        <BigTitle size={44}>{target === "pickup" ? "Nereden?" : "Nereye?"}</BigTitle>
        <Sticker name="pin" size={64} rotation={8} style={{ position: "absolute", right: 10, top: -14 }} />
      </View>
      {/* Arama: lila zeminde beyaz hap (giriş ekranındaki telefon alanıyla aynı dil) */}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radii.pill,
          // Odak göstergesi hapın kendisi (tarayıcının kare çerçevesi yerine)
          borderWidth: 2,
          borderColor: focused ? colors.ink : "transparent",
          minHeight: 60,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 8,
          paddingRight: 14,
          gap: 10,
        }}
      >
        <View style={{ height: 44, width: 44, borderRadius: radii.pill, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="search" size={20} color={colors.ink} />
        </View>
        <TextInput
          accessibilityLabel={target === "pickup" ? "Alış adresi" : "Teslim adresi"}
          placeholder="Mahalle, cadde, iş yeri adı…"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            setSelected(null);
            setApproximate(false);
          }}
          autoFocus
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          testID="address-search"
          style={{ ...font("bold"), flex: 1, fontSize: 17, color: colors.ink, paddingVertical: 12, outlineWidth: 0 }}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Aramayı temizle" hitSlop={12} onPress={() => {
              setQuery("");
              setSelected(null);
              setItems([]);
            }}
          >
            <Ionicons name="close-circle" size={20} color={colors.inactive} />
          </Pressable>
        ) : null}
      </View>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      <ErrorBox message={error} />
      {items.length > 0 && query.trim().length >= 3 && !selected ? (
        <Card style={{ padding: 0, gap: 0, overflow: "hidden" }}>
          {items.map((s, i) => (
            <Pressable
              key={s.placeId}
              onPress={() => pick(s)}
              testID={`suggestion-${i}`}
              style={({ pressed }) => ({ padding: 14, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderColor: colors.bg, backgroundColor: pressed ? colors.bg : "transparent" })}
            >
              <Txt weight="bold" size={15}>
                {s.title}
              </Txt>
              <Muted>{s.subtitle}</Muted>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {browsing ? (
        <>
          <Card style={{ padding: 0, gap: 0, overflow: "hidden" }}>
            <PlaceRow
              first
              dark
              icon="navigate"
              title={locating ? "Konumunuz alınıyor…" : "Konumumu kullan"}
              subtitle="Bulunduğunuz yeri adres olarak seçin"
              onPress={useMyLocation}
              testID="use-my-location"
            />
          </Card>
          {recent.length ? (
            <>
              <Txt style={[type.label, { marginTop: 4, marginLeft: 4 }]}>SON ADRESLER</Txt>
              <Card style={{ padding: 0, gap: 0, overflow: "hidden" }}>
                {recent.map((p, i) => (
                  <PlaceRow
                    key={p.address}
                    first={i === 0}
                    icon="time-outline"
                    title={p.address}
                    subtitle={SIDE_LABEL[p.side]}
                    onPress={() => pickRecent(p, i)}
                    testID={`recent-${i}`}
                  />
                ))}
              </Card>
            </>
          ) : (
            <Muted style={{ textAlign: "center" }}>Aramak için en az 3 harf yazın.</Muted>
          )}
        </>
      ) : null}

      {selected ? (
        <Card>
          {/* Pin onayı: seçilen nokta haritada */}
          <TileMap markers={[{ kind: target === "pickup" ? "pickup" : "dropoff", lat: selected.lat, lng: selected.lng }]} height={160} route={false} />
          <View style={{ gap: 2 }}>
            <Txt weight="extrabold" size={16}>
              {selected.address}
            </Txt>
            {selected.district ? (
              <Txt size={13} color={colors.muted}>
                {selected.district}
              </Txt>
            ) : null}
          </View>
          {sideHint ? (
            <View
              testID="side-hint"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: crossings ? colors.ink : colors.bg,
                borderRadius: radii.pill,
                paddingHorizontal: 14,
                paddingVertical: 9,
              }}
            >
              {/* Paid crossing: small bridge sticker (white die-cut edge reads on the ink pill); otherwise the plain pin icon */}
              {crossings ? <Sticker name="kopru" size={26} /> : <Ionicons name="location" size={16} color={colors.ink} />}
              <Txt weight="bold" size={13} color={crossings ? "#fff" : colors.ink} style={{ flex: 1 }}>
                {sideHint}
              </Txt>
            </View>
          ) : null}
          {approximate ? <Muted style={{ color: colors.warn }}>Adres bulunamadı; kuryenin sizi bulabilmesi için adres tarifini yazın.</Muted> : null}
          <Field
            label={approximate ? "Adres tarifi (zorunlu)" : "Adres tarifi"}
            placeholder="Bina no, kat, daire, firma adı"
            value={details}
            onChangeText={setDetails}
            testID="address-details"
          />
          <Button title="Bu adresi kullan" onPress={save} disabled={needsDetails} testID="address-save" />
        </Card>
      ) : null}
      <View style={{ height: 24 }} />
    </Screen>
  );
}
