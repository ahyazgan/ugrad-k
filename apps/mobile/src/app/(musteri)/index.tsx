import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { HandTag, InkPillBar, RouteCard, Wordmark } from "@/components/Neo";
import { Sticker } from "@/components/Sticker";
import { Button, Card, Field, Muted, Screen, Segmented, ToggleRow, Txt, colors, font, radii, shadow, type } from "@/components/ui";
import { api, type DraftPoint } from "@/lib/api";
import { useOrderDraft } from "@/lib/order-draft";
import { usePricingSettings } from "@/lib/pricing-settings";
import { recentPlaces, type RecentPlace } from "@/lib/recent";

/** Kuruş → "1.000 TL" (fiyat ayarından gelen tutarlar; kodda sabit yazılmaz) */
const tl = (kurus: number) => `${(kurus / 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL`;

/** Arama çubuğunun altındaki son 3 adres: dokununca teslim adresi olur */
function RecentChips({ places, onPick }: { places: RecentPlace[]; onPick: (p: RecentPlace) => void }) {
  if (!places.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 4 }} style={{ marginTop: -4 }}>
      {places.map((p, i) => (
        <Pressable
          key={p.address}
          testID={`recent-chip-${i}`}
          accessibilityRole="button"
          accessibilityLabel={`Son adres: ${p.address}`}
          onPress={() => onPick(p)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            maxWidth: 240,
            backgroundColor: pressed ? colors.primaryLight : colors.surface,
            borderRadius: radii.pill,
            minHeight: 44,
            paddingLeft: 12,
            paddingRight: 16,
          })}
        >
          <Ionicons name="time-outline" size={15} color={colors.ink} />
          <Txt weight="bold" size={13} numberOfLines={1} style={{ flexShrink: 1 }}>
            {p.label}
          </Txt>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function openAddress(target: "pickup" | "dropoff") {
  router.push({ pathname: "/adres", params: { target } });
}

/** NEREDEN / NEREYE satırı (rota kartının içinde) */
function AddressButton({ label, point, target }: { label: string; point: DraftPoint | null; target: "pickup" | "dropoff" }) {
  return (
    <Pressable
      testID={`address-${target}`}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${point ? point.address : "adres seçin"}`}
      onPress={() => openAddress(target)}
      style={{ minHeight: 48, justifyContent: "center", paddingVertical: 8, gap: 2 }}
    >
      <Text style={type.label}>{label}</Text>
      <Text style={{ ...font("bold"), fontSize: 15, color: point ? colors.text : colors.muted }} numberOfLines={2}>
        {point ? point.address : "Adres seçin"}
      </Text>
      {point?.details ? <Muted>{point.details}</Muted> : null}
    </Pressable>
  );
}

/** Ana sayfadaki iki kısayol kartı: dokununca ilgili seçeneği açar/kapatır */
function QuickCard({
  selected,
  onPress,
  tone,
  testID,
  label,
  children,
  hint,
}: {
  selected: boolean;
  onPress: () => void;
  tone: "lime" | "white";
  testID: string;
  label: string;
  children: React.ReactNode;
  hint: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 146,
        borderRadius: radii.card,
        padding: 16,
        paddingTop: 14,
        backgroundColor: tone === "lime" ? colors.lime : colors.surface,
        borderWidth: 2,
        borderColor: selected ? colors.ink : "transparent",
        opacity: pressed ? 0.9 : 1,
        overflow: "hidden",
      })}
    >
      {children}
      <Text style={{ ...font("semibold"), fontSize: 12, marginTop: 6, color: tone === "lime" ? colors.ink : colors.mutedDark }}>{hint}</Text>
      <View
        style={{
          marginTop: "auto",
          alignSelf: "flex-start",
          height: 32,
          paddingHorizontal: 12,
          borderRadius: radii.pill,
          backgroundColor: tone === "lime" ? colors.ink : colors.bg,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        {selected ? (
          <Text style={{ ...font("extrabold"), fontSize: 12, color: tone === "lime" ? colors.lime : colors.ink }}>Seçildi</Text>
        ) : null}
        <Ionicons name={selected ? "checkmark" : "arrow-forward"} size={16} color={tone === "lime" ? colors.lime : colors.ink} />
      </View>
    </Pressable>
  );
}

export default function YeniGonderi() {
  const { draft, update } = useOrderDraft();
  const P = usePricingSettings();
  const ready = !!draft.pickup && !!draft.dropoff;
  // Return-leg discount as copy: 50 → "yarı fiyat", otherwise "%40 indirimli"
  const returnDeal = P.returnLegDiscountPct === 50 ? "yarı fiyat" : `%${P.returnLegDiscountPct.toLocaleString("tr-TR")} indirimli`;
  const { width } = useWindowDimensions();
  const heroSize = Math.min(80, Math.max(56, Math.round(width * 0.2)));
  // Çıkartmalar başlık satırlarının sonundaki boşluğa sığdırılır (zarfın sağında şimşek taşar: 24 px);
  // dar ekranlarda yer yoksa gösterilmez (yazının üstüne binmesin).
  const contentWidth = width - 32;
  const zarfSize = Math.round(Math.min(heroSize * 0.72, contentWidth - heroSize * 2.5 - 28 - 24));
  const kutuSize = Math.round(Math.min(heroSize * 0.82, contentWidth - heroSize * 2.08 - 8));
  // Son 3 adres (geçmiş siparişlerden); okunamazsa çipler gösterilmez
  const [recent, setRecent] = useState<RecentPlace[]>([]);
  useFocusEffect(
    useCallback(() => {
      api.listOrders().then((o) => setRecent(recentPlaces(o, 3)), () => setRecent([]));
    }, []),
  );

  function start() {
    if (ready) router.push("/ozet");
    else openAddress(draft.dropoff ? "pickup" : "dropoff");
  }

  return (
    <Screen safeTop>
      {/* Üst: logo + hesap */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Wordmark />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hesap ayarları"
          onPress={() => router.navigate("/(musteri)/hesap")}
          style={{ width: 50, height: 50, borderRadius: 99, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", ...shadow }}
        >
          <Ionicons name="person" size={22} color={colors.ink} />
        </Pressable>
      </View>

      {/* Dev başlık + el yazısı etiket ("Kapında."nın altına iner, kelimeyi kesmez) */}
      <View style={{ minHeight: heroSize * 2.9, justifyContent: "center", marginTop: 4, marginBottom: 16 }}>
        <Text accessibilityRole="header" style={{ ...type.hero, fontSize: heroSize, lineHeight: heroSize * 0.94, letterSpacing: -heroSize * 0.056 }}>
          {"Hızlı.\nNet.\nKapında."}
        </Text>
        {/* 3B çıkartmalar: satır sonlarındaki boşluklarda */}
        {zarfSize >= 40 ? (
          <>
            <Sticker name="zarf" size={zarfSize} rotation={-10} style={{ position: "absolute", left: heroSize * 2.5, top: heroSize * 0.02 }} />
            <Sticker name="simsek" size={40} rotation={14} style={{ position: "absolute", left: heroSize * 2.5 + zarfSize - 16, top: -heroSize * 0.2 }} />
          </>
        ) : null}
        {kutuSize >= 40 ? (
          <Sticker name="kutu" size={kutuSize} rotation={6} style={{ position: "absolute", left: heroSize * 2.08 + 2, top: heroSize * 1.0 }} />
        ) : null}
        {/* Tek el yazısı etiket: bilgi taşıyan "aynı gün" vaadi (süs etiketleri kaldırıldı) */}
        <HandTag tone="white" rotate={-6} style={{ position: "absolute", right: 0, bottom: -22 }}>
          BUGÜN ORADA ✓
        </HandTag>
      </View>

      <InkPillBar
        placeholder={draft.dropoff ? draft.dropoff.address : "Nereye gönderelim?"}
        action="Gönder"
        accessibilityLabel="Nereye gönderelim? Gönder"
        onPress={start}
        testID="start-send"
      />
      <RecentChips places={recent} onPick={(p) => update({ dropoff: { address: p.address, lat: p.lat, lng: p.lng, district: p.district } })} />

      <View style={{ flexDirection: "row", gap: 8 }}>
        <QuickCard
          tone="lime"
          testID="quick-acil"
          label="Acil 60 dakika"
          selected={draft.serviceLevel === "acil"}
          onPress={() => update({ serviceLevel: draft.serviceLevel === "acil" ? "standart" : "acil" })}
          hint="60 dakikada kapında."
        >
          <Sticker name="kronometre" size={36} rotation={8} style={{ position: "absolute", right: 8, top: 8 }} />
          <Text style={{ ...font("black"), fontSize: 30, lineHeight: 29, letterSpacing: -1.2, color: colors.ink }}>{"Acil\n60 dk"}</Text>
        </QuickCard>
        <QuickCard
          tone="white"
          testID="quick-roundtrip"
          label={`Gidiş-dönüş, dönüşü ${returnDeal}`}
          selected={draft.roundTrip}
          onPress={() => update({ roundTrip: !draft.roundTrip })}
          hint="Daha akıllı gönderim."
        >
          <Sticker name="donus" size={36} rotation={-8} style={{ position: "absolute", right: 14, bottom: 8 }} />
          <Text style={{ ...font("black"), fontSize: 16, lineHeight: 17, letterSpacing: -0.4, color: colors.ink }}>
            Gidiş-dönüş, dönüşü <Text style={{ backgroundColor: colors.lime }}>{returnDeal}</Text>
          </Text>
        </QuickCard>
      </View>

      {/* Hizmet bölgesi şeridi */}
      <View
        style={{
          minHeight: 48,
          backgroundColor: colors.surface,
          borderRadius: radii.pill,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 16,
        }}
      >
        <Ionicons name="location" size={16} color={colors.ink} />
        <Text style={{ ...font("semibold"), fontSize: 12, color: colors.ink, flex: 1 }}>Anadolu yakası • Avrupa yakası • 7 gün</Text>
        <Ionicons name="bicycle" size={20} color={colors.ink} />
      </View>

      {/* Gönderi formu */}
      <Text style={{ ...type.h2, marginTop: 10 }}>Ne, nereye?</Text>
      <RouteCard
        from={<AddressButton label="NEREDEN (ALIŞ)" point={draft.pickup} target="pickup" />}
        to={<AddressButton label="NEREYE (TESLİM)" point={draft.dropoff} target="dropoff" />}
      />

      <Card>
        <Text style={type.h3}>Alış</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label="Teslim eden kişi" placeholder="Ad Soyad" value={draft.pickupContactName} onChangeText={(v) => update({ pickupContactName: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Telefonu" placeholder="05xx" keyboardType="phone-pad" value={draft.pickupContactPhone} onChangeText={(v) => update({ pickupContactPhone: v })} />
          </View>
        </View>
        <Text style={type.h3}>Teslim</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label="Alıcı" placeholder="Ad Soyad" value={draft.dropoffContactName} onChangeText={(v) => update({ dropoffContactName: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Telefonu" placeholder="05xx" keyboardType="phone-pad" value={draft.dropoffContactPhone} onChangeText={(v) => update({ dropoffContactPhone: v })} />
          </View>
        </View>
      </Card>

      <Text style={{ ...type.h3, marginTop: 4 }}>Paket</Text>
      <Card>
        <Field
          label="Ne gönderiyorsunuz?"
          placeholder="Örn. imzalı sözleşme, numune paketi"
          value={draft.packageDescription}
          onChangeText={(v) => update({ packageDescription: v })}
        />
        <Field
          label={`Ağırlık (kg, isteğe bağlı${P.maxWeightKg ? `, en fazla ${P.maxWeightKg}` : ""})`}
          placeholder="Örn. 2"
          keyboardType="decimal-pad"
          value={draft.weightKg}
          onChangeText={(v) => update({ weightKg: v })}
        />
        <ToggleRow label="Büyük paket" hint={`Motora sığan ama hacimli paketler, +${tl(P.heavySurchargeKurus)}`} value={draft.largePackage} onChange={(v) => update({ largePackage: v })} />
      </Card>

      <Text style={{ ...type.h3, marginTop: 4 }}>Ne zaman ulaşsın?</Text>
      <Card>
        <Segmented
          testIDPrefix="level"
          value={draft.serviceLevel}
          onChange={(v) => update({ serviceLevel: v })}
          options={[
            { value: "ekonomi", label: "Ekonomi", hint: "Gün içinde, indirimli" },
            { value: "standart", label: "Standart", hint: "En kısa sürede" },
            { value: "acil", label: "Acil", hint: "60 dk, ek ücretli" },
          ]}
        />
        {draft.serviceLevel === "ekonomi" ? <Muted>{`Ekonomi: Pazartesi–Cumartesi, alışı saat ${P.economyCutoffHour}.00 öncesine planlanan siparişler aynı gün teslim edilir.`}</Muted> : null}
        <ToggleRow label="Gidiş-dönüş" hint={`Dönüş ayağı %${P.returnLegDiscountPct.toLocaleString("tr-TR")} indirimli`} value={draft.roundTrip} onChange={(v) => update({ roundTrip: v })} />
        <Field
          label="Gönderinin değeri (TL, isteğe bağlı)"
          placeholder="Örn. 25.000"
          keyboardType="decimal-pad"
          value={draft.declaredValue}
          onChangeText={(v) => update({ declaredValue: v })}
          testID="declared-value"
        />
        <Muted>{`${tl(P.freeCoverageKurus)}'ye kadar ücretsiz güvencededir; üstü için küçük bir sigorta ücreti fiyata eklenir.`}</Muted>
        <ToggleRow
          label="Teslim kodu ile teslim"
          hint="Alıcıya SMS ile kod gider; kurye kodu almadan teslim edemez"
          value={draft.deliveryCode}
          onChange={(v) => update({ deliveryCode: v })}
        />
        <Field
          label="Kuryeye not"
          placeholder="Örn. resepsiyona bırakın"
          value={draft.customerNote}
          onChangeText={(v) => update({ customerNote: v })}
          multiline
        />
      </Card>

      <Button title="Fiyatı gör" onPress={() => router.push("/ozet")} disabled={!ready} testID="see-price" />
      {!ready ? <Muted style={{ textAlign: "center" }}>Fiyat için alış ve teslim adreslerini seçin.</Muted> : null}
    </Screen>
  );
}
