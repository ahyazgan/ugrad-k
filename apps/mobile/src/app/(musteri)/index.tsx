import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Button, Card, Field, Muted, Screen, Segmented, ToggleRow, colors } from "@/components/ui";
import type { DraftPoint } from "@/lib/api";
import { useOrderDraft } from "@/lib/order-draft";

function AddressButton({ label, point, target }: { label: string; point: DraftPoint | null; target: "pickup" | "dropoff" }) {
  return (
    <Pressable
      testID={`address-${target}`}
      onPress={() => router.push({ pathname: "/adres", params: { target } })}
      style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, backgroundColor: "#fff", gap: 2 }}
    >
      <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "600" }}>{label}</Text>
      <Text style={{ fontSize: 15, color: point ? colors.text : colors.muted }} numberOfLines={2}>
        {point ? point.address : "Adres seçin"}
      </Text>
      {point?.details ? <Muted>{point.details}</Muted> : null}
    </Pressable>
  );
}

export default function YeniGonderi() {
  const { draft, update } = useOrderDraft();
  const ready = !!draft.pickup && !!draft.dropoff;

  return (
    <Screen>
      <Card>
        <AddressButton label="NEREDEN (alış)" point={draft.pickup} target="pickup" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label="Teslim eden kişi" placeholder="Ad Soyad" value={draft.pickupContactName} onChangeText={(v) => update({ pickupContactName: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Telefonu" placeholder="05xx" keyboardType="phone-pad" value={draft.pickupContactPhone} onChangeText={(v) => update({ pickupContactPhone: v })} />
          </View>
        </View>
      </Card>

      <Card>
        <AddressButton label="NEREYE (teslim)" point={draft.dropoff} target="dropoff" />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label="Alıcı" placeholder="Ad Soyad" value={draft.dropoffContactName} onChangeText={(v) => update({ dropoffContactName: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Telefonu" placeholder="05xx" keyboardType="phone-pad" value={draft.dropoffContactPhone} onChangeText={(v) => update({ dropoffContactPhone: v })} />
          </View>
        </View>
      </Card>

      <Card>
        <Field
          label="Ne gönderiyorsunuz?"
          placeholder="Örn. imzalı sözleşme, numune paketi"
          value={draft.packageDescription}
          onChangeText={(v) => update({ packageDescription: v })}
        />
        <Field
          label="Ağırlık (kg, isteğe bağlı, en fazla 20)"
          placeholder="Örn. 2"
          keyboardType="decimal-pad"
          value={draft.weightKg}
          onChangeText={(v) => update({ weightKg: v })}
        />
        <Segmented
          label="Hizmet"
          testIDPrefix="level"
          value={draft.serviceLevel}
          onChange={(v) => update({ serviceLevel: v })}
          options={[
            { value: "ekonomi", label: "Ekonomi", hint: "Gün içinde, indirimli" },
            { value: "standart", label: "Standart", hint: "En kısa sürede" },
            { value: "acil", label: "Acil", hint: "60 dk, ek ücretli" },
          ]}
        />
        {draft.serviceLevel === "ekonomi" ? <Muted>Ekonomi: Pazartesi–Cumartesi öğleden önce verilen siparişler aynı gün teslim edilir.</Muted> : null}
        <ToggleRow label="Gidiş-dönüş" hint="Dönüş ayağı %50 indirimli" value={draft.roundTrip} onChange={(v) => update({ roundTrip: v })} />
        <ToggleRow label="Büyük paket" hint="Motora sığan ama hacimli paketler, +150 TL" value={draft.largePackage} onChange={(v) => update({ largePackage: v })} />
        <Field
          label="Gönderinin değeri (TL, isteğe bağlı)"
          placeholder="Örn. 25.000"
          keyboardType="decimal-pad"
          value={draft.declaredValue}
          onChangeText={(v) => update({ declaredValue: v })}
          testID="declared-value"
        />
        <Muted>{"1.000 TL'ye kadar ücretsiz güvencededir; üstü için küçük bir sigorta ücreti fiyata eklenir."}</Muted>
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
