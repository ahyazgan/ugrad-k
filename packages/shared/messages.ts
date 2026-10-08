/** Uygulama içi mesajlaşma: hazır cevaplar ve bildirim önizlemesi */
export type MessageRole = "musteri" | "kurye" | "admin";

export const QUICK_REPLIES: Record<"musteri" | "kurye", readonly string[]> = {
  kurye: [
    "Kapıdayım",
    "5 dakika içinde oradayım",
    "Trafikteyim, biraz gecikeceğim",
    "Adresi bulamadım, konum gönderebilir misiniz?",
    "Paketi aldım, yoldayım",
  ],
  musteri: ["Tamam, teşekkürler", "Resepsiyona bırakabilirsiniz", "Kapıda bekliyorum", "Lütfen beni arayın"],
};

/** Bildirimde gösterilecek kısa önizleme */
export function messagePreview(body: string, max = 120): string {
  const t = body.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
