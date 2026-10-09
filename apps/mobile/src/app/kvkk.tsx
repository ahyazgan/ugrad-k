import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState, type ComponentProps } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { BigTitle } from "@/components/Neo";
import { Sticker } from "@/components/Sticker";
import { Button, Card, Checkbox, ErrorBox, Muted, Screen, Txt, colors, font, styles, type } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import {
  ACIK_RIZA_KONUM,
  AYDINLATMA_METNI,
  KURYE_AYDINLATMA_METNI,
  KURYE_KONUM_ONAYI,
  KVKK_SUMMARY,
  KVKK_VERSION,
  TICARI_ILETI,
} from "@/lib/kvkk";
import { useSession } from "@/lib/session";

/** Özet satırı: simge + etiket + tek cümle */
function SummaryRow({ icon, label, text }: { icon: ComponentProps<typeof Ionicons>["name"]; label: string; text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={17} color={colors.ink} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={type.label}>{label}</Txt>
        <Txt weight="semibold" size={14}>
          {text}
        </Txt>
      </View>
    </View>
  );
}

export default function Kvkk() {
  const { refresh, profile } = useSession();
  const courier = profile?.role === "kurye";
  const summary = KVKK_SUMMARY[courier ? "kurye" : "musteri"];
  const [read, setRead] = useState(false);
  const [location, setLocation] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await api.saveConsents(
        [
          { type: "kvkk_aydinlatma", granted: true },
          { type: "acik_riza_konum", granted: true },
          { type: "ticari_ileti", granted: marketing },
        ],
        KVKK_VERSION,
      );
      await refresh();
      router.replace("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi");
    } finally {
      setLoading(false);
    }
  }

  const ready = read && location;

  return (
    <Screen safeTop>
      <View style={{ marginTop: 12 }}>
        <BigTitle size={44}>{"Verilerin\ngüvende."}</BigTitle>
        <Sticker name="imza" size={56} rotation={8} style={{ position: "absolute", right: 10, top: -4 }} />
      </View>
      <Muted>Devam etmeden önce kişisel verilerinizi nasıl işlediğimizi okuyun.</Muted>

      {/* 3 satırlık özet; bağlayıcı metin aşağıda "Tamamını oku" ile açılır */}
      <Card style={{ gap: 14 }}>
        <SummaryRow icon="folder-open-outline" label="NE TOPLUYORUZ" text={summary.what} />
        <SummaryRow icon="help-circle-outline" label="NEDEN" text={summary.why} />
        <SummaryRow icon="trash-outline" label="NE ZAMAN SİLİYORUZ" text={summary.when} />
        <Pressable
          testID="kvkk-full-toggle"
          accessibilityRole="button"
          accessibilityState={{ expanded: fullOpen }}
          onPress={() => setFullOpen((v) => !v)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: colors.bg,
            minHeight: 48,
            paddingTop: 4,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Txt weight="extrabold" size={15} style={{ textDecorationLine: "underline" }}>
            {fullOpen ? "Aydınlatma metnini gizle" : "Aydınlatma metninin tamamını oku"}
          </Txt>
          <Ionicons name={fullOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.ink} />
        </Pressable>
        {fullOpen ? (
          <View style={{ maxHeight: 320, backgroundColor: colors.bg, borderRadius: 16, padding: 14 }}>
            <ScrollView nestedScrollEnabled>
              <Text style={[styles.body, { lineHeight: 21 }]}>{courier ? KURYE_AYDINLATMA_METNI : AYDINLATMA_METNI}</Text>
            </ScrollView>
          </View>
        ) : null}
      </Card>

      <Card>
        <Checkbox checked={read} onChange={setRead}>
          <Text style={{ ...font("bold"), color: colors.text }}>Aydınlatma metnini okudum, anladım.</Text>
        </Checkbox>
        <Checkbox checked={location} onChange={setLocation}>
          <Text style={{ ...font("bold"), color: colors.text }}>{courier ? "Konum bilgilendirmesi (zorunlu)" : "Açık rıza (zorunlu)"}</Text>
          <Muted>{courier ? KURYE_KONUM_ONAYI : ACIK_RIZA_KONUM}</Muted>
        </Checkbox>
        {!courier ? (
          <Checkbox checked={marketing} onChange={setMarketing}>
            <Muted>{TICARI_ILETI}</Muted>
          </Checkbox>
        ) : null}
      </Card>
      <ErrorBox message={error} />
      <Button title="Onayla ve devam et" onPress={submit} loading={loading} disabled={!ready} testID="kvkk-accept" />
      {!ready ? <Muted style={{ textAlign: "center" }}>Devam etmek için ilk iki kutuyu işaretleyin.</Muted> : null}
      <Button
        title="Çıkış yap"
        variant="secondary"
        onPress={async () => {
          await api.signOut();
          router.replace("/giris");
        }}
      />
    </Screen>
  );
}
