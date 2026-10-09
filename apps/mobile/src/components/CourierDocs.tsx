import { courierCompliance, type Compliance, type CourierDocument, type DocumentState } from "@yazgan/shared";
import { Text, View } from "react-native";
import { Card, Muted, colors, font } from "@/components/ui";

const STATE: Record<DocumentState, { label: string; color: string }> = {
  gecerli: { label: "Geçerli", color: colors.success },
  yaklasiyor: { label: "Süresi yaklaşıyor", color: colors.warn },
  suresi_doldu: { label: "Süresi dolmuş", color: colors.danger },
  eksik: { label: "Eksik", color: colors.muted },
};

const fmtDay = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`;

export const complianceFor = (docs: CourierDocument[]) => courierCompliance(docs);

/** İşlerim ekranında: vardiyayı engelleyen veya süresi yaklaşan belge uyarısı */
export function DocumentWarning({ c }: { c: Compliance | null }) {
  if (!c || (!c.blocking.length && !c.warnings.length)) return null;
  const blocking = c.blocking.length > 0;
  const list = blocking ? c.blocking : c.warnings;
  return (
    <Card style={{ borderColor: blocking ? colors.danger : colors.accent, backgroundColor: blocking ? colors.dangerLight : colors.warnLight }}>
      <View testID="doc-warning">
        <Text style={{ ...font("extrabold"), color: blocking ? colors.danger : colors.warn }}>
          {blocking ? "Belgeleriniz eksik: vardiya başlatamazsınız" : "Belge süreniz yaklaşıyor"}
        </Text>
        {list.map((i) => (
          <Muted key={i.kind}>
            {i.label}: {i.state === "eksik" ? "eksik" : i.daysLeft != null && i.daysLeft >= 0 ? `${i.daysLeft} gün kaldı` : "süresi dolmuş"}
          </Muted>
        ))}
        <Muted>Yenilenmiş belgenizi yöneticinize iletin.</Muted>
      </View>
    </Card>
  );
}

/** Hesabım ekranında belge listesi (zorunlular ve girilmiş olanlar) */
export function DocumentList({ c }: { c: Compliance }) {
  const items = c.items.filter((i) => i.required || i.state !== "eksik");
  return (
    <Card>
      <Text style={{ ...font("extrabold"), color: colors.text }}>Belgelerim</Text>
      {items.map((i) => (
        <View key={i.kind} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ ...font("semibold"), flex: 1, color: colors.text }}>{i.label}</Text>
          <Text style={{ color: STATE[i.state].color, ...font("bold") }}>
            {STATE[i.state].label}
            {i.expiresAt ? ` · ${fmtDay(i.expiresAt)}` : ""}
          </Text>
        </View>
      ))}
    </Card>
  );
}
