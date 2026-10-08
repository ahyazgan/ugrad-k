import { ORDER_STATUS_LABELS, type OrderStatus } from "@yazgan/shared";
import { Text, View } from "react-native";
import { colors } from "./ui";

const TONE: Record<OrderStatus, [bg: string, fg: string]> = {
  beklemede: ["#FEF3C7", "#92400E"],
  onaylandi: [colors.primaryLight, colors.primary],
  kuryeye_atandi: [colors.primaryLight, colors.primary],
  alindi: ["#E0E7FF", "#3730A3"],
  yolda: ["#E0E7FF", "#3730A3"],
  teslim_edildi: [colors.successLight, colors.success],
  iptal: ["#F3F4F6", colors.muted],
  sorunlu: [colors.dangerLight, colors.danger],
  geri_donuyor: ["#FFEDD5", "#9A3412"],
  geri_teslim: ["#F3F4F6", "#44403C"],
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const [bg, fg] = TONE[status];
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontWeight: "600", fontSize: 12 }}>{ORDER_STATUS_LABELS[status]}</Text>
    </View>
  );
}
