/** Sipariş durumları — veritabanındaki `order_status` enum'u ile birebir aynı. */
export const ORDER_STATUSES = [
  "beklemede",
  "onaylandi",
  "kuryeye_atandi",
  "alindi",
  "yolda",
  "teslim_edildi",
  "iptal",
  "sorunlu",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  beklemede: "Beklemede",
  onaylandi: "Onaylandı",
  kuryeye_atandi: "Kuryeye atandı",
  alindi: "Alındı",
  yolda: "Yolda",
  teslim_edildi: "Teslim edildi",
  iptal: "İptal",
  sorunlu: "Sorunlu",
};

/** İzin verilen durum geçişleri. `sorunlu` bir siparişi yönetici tekrar akışa alabilir. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  beklemede: ["onaylandi", "iptal"],
  onaylandi: ["kuryeye_atandi", "iptal", "sorunlu"],
  kuryeye_atandi: ["alindi", "onaylandi", "iptal", "sorunlu"],
  alindi: ["yolda", "sorunlu"],
  yolda: ["teslim_edildi", "sorunlu"],
  teslim_edildi: [],
  iptal: [],
  sorunlu: ["onaylandi", "kuryeye_atandi", "alindi", "yolda", "teslim_edildi", "iptal"],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export const isFinalStatus = (s: OrderStatus) => ORDER_TRANSITIONS[s].length === 0;
