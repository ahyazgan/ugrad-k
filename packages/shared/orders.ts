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
  /** Alıcıya ulaşılamadı, paket göndericiye geri götürülüyor */
  "geri_donuyor",
  /** Paket göndericiye geri teslim edildi (son durum) */
  "geri_teslim",
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
  geri_donuyor: "Göndericiye dönüyor",
  geri_teslim: "Göndericiye iade edildi",
};

/** İzin verilen durum geçişleri. `sorunlu` bir siparişi yönetici tekrar akışa alabilir. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  beklemede: ["onaylandi", "iptal"],
  onaylandi: ["kuryeye_atandi", "iptal", "sorunlu"],
  kuryeye_atandi: ["alindi", "onaylandi", "iptal", "sorunlu"],
  alindi: ["yolda", "sorunlu"],
  yolda: ["teslim_edildi", "sorunlu", "geri_donuyor"],
  teslim_edildi: [],
  iptal: [],
  sorunlu: ["onaylandi", "kuryeye_atandi", "alindi", "yolda", "teslim_edildi", "iptal", "geri_donuyor"],
  geri_donuyor: ["geri_teslim", "sorunlu"],
  geri_teslim: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export const isFinalStatus = (s: OrderStatus) => ORDER_TRANSITIONS[s].length === 0;

/** Teslim edilemedi nedenleri (orders.failed_reason) */
export type FailedDeliveryReason = "alici_yok" | "adres_bulunamadi" | "alici_reddetti" | "kapali" | "diger";

export const FAILED_DELIVERY_REASONS: Record<FailedDeliveryReason, string> = {
  alici_yok: "Alıcıya ulaşılamadı",
  adres_bulunamadi: "Adres bulunamadı",
  alici_reddetti: "Alıcı teslim almadı",
  kapali: "İş yeri / bina kapalı",
  diger: "Diğer",
};

/** Bu nedenlerde teslim adresinde en az ops.failed_delivery_min_wait_minutes beklenmiş olmalı */
export const FAILED_REASONS_REQUIRING_WAIT: readonly FailedDeliveryReason[] = ["alici_yok", "kapali", "diger"];

/** İş tamamlandı mı (teslim veya göndericiye iade) */
export const isCompletedStatus = (s: OrderStatus) => s === "teslim_edildi" || s === "geri_teslim";
