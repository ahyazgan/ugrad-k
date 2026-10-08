import { ORDER_STATUS_LABELS, type OrderStatus } from "@yazgan/shared";
import { Text, View } from "react-native";
import { colors, font } from "./ui";

// Neo: hareket hâlindeki işler siyah hap + limon yazı (limon yazı yalnız siyah zeminde), teslim limon zemin
const TONE: Record<OrderStatus, [bg: string, fg: string]> = {
  beklemede: ["#FFF1C7", "#6B4A00"],
  onaylandi: [colors.primaryLight, colors.ink],
  kuryeye_atandi: [colors.primaryLight, colors.ink],
  alindi: [colors.ink, colors.lime],
  yolda: [colors.ink, colors.lime],
  teslim_edildi: [colors.lime, colors.ink],
  iptal: ["#EEEDF3", colors.muted],
  sorunlu: [colors.dangerLight, colors.danger],
  geri_donuyor: ["#FFEDD5", "#9A3412"],
  geri_teslim: ["#F3F4F6", "#44403C"],
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const [bg, fg] = TONE[status];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, alignSelf: "flex-start" }}>
      <Text style={{ ...font("extrabold"), color: fg, fontSize: 12 }}>{ORDER_STATUS_LABELS[status]}</Text>
    </View>
  );
}
