// Yasal metinler packages/shared/legal.ts içinde (tek kaynak)
export * from "@yazgan/shared/legal";

/**
 * KVKK ekranının üstündeki 3 satırlık özet. Yalnızca aydınlatma metinlerinde zaten yazanları kısaltır;
 * bağlayıcı metin AYDINLATMA_METNI / KURYE_AYDINLATMA_METNI'dir ("Tamamını oku" ile açılır).
 */
export const KVKK_SUMMARY: Record<"musteri" | "kurye", { what: string; why: string; when: string }> = {
  musteri: {
    what: "Ad, telefon, alış/teslim adresleri ve teslim kanıtı (fotoğraf, imza).",
    why: "Gönderinizi fiyatlamak, teslim etmek, takip ettirmek ve faturalamak için.",
    when: "Yazışmalar 90 gün; sipariş ve fatura kayıtları vergi mevzuatı gereği 10 yıl saklanır, sonra silinir.",
  },
  kurye: {
    what: "Kimlik, iletişim, vardiya kayıtları ve teslim kanıtları; konum yalnızca vardiya açıkken.",
    why: "İş atama, canlı takip, teslimat güvenliği ve çalışma saatlerinin kaydı (BTK) için.",
    when: "Konum geçmişi en fazla 6 ay; vardiya kayıtları mevzuatın öngördüğü süre boyunca saklanır.",
  },
};
