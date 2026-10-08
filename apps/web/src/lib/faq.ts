import { BRAND, DEFAULT_PRICING_SETTINGS as S } from "@yazgan/shared";

export const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Fiyat nasıl hesaplanıyor?",
    a: `Alış ve teslim adresleri arasındaki gerçek sürüş mesafesine göre. İlk ${S.includedKm} km açılış ücretine dahildir; sonrası kademeli km ücretiyle eklenir. Acil, gece, Pazar, gidiş-dönüş ve büyük paket gibi ek ücretler fiyat özetinde tek tek gösterilir; gizli ücret yoktur. Fiyatlara KDV (%${S.vatPct}) eklenir.`,
  },
  {
    q: "Kurye ne kadar sürede gelir?",
    a: "Siparişiniz onaylanır onaylanmaz alış noktasına en yakın uygun kuryeye otomatik olarak atanır. Acil seçeneğinde 60 dakika içinde teslim hedeflenir; gönderiniz alındıktan sonra başka iş yapılmadan doğrudan teslim edilir.",
  },
  {
    q: "Ekonomi gönderi nedir?",
    a: `Acelesi olmayan gönderiler için %${S.economyDiscountPct} indirimli seçenek: Pazartesi–Cumartesi saat ${S.economyCutoffHour}:00'e kadar verilen siparişler aynı gün içinde, aynı yöne giden işlerle birlikte teslim edilir.`,
  },
  {
    q: "Avrupa yakasına teslimat yapıyor musunuz?",
    a: "Evet. Anadolu yakasından Avrupa yakasına geçişlerde köprü geçiş ücreti fiyata ayrıca ve açıkça eklenir.",
  },
  {
    q: "Gönderimi nasıl takip ederim?",
    a: "Sipariş verdiğinizde size ve isterseniz alıcıya canlı takip bağlantısı gönderilir. Kuryenin konumunu haritada görebilirsiniz.",
  },
  {
    q: "Teslim edildiğini nasıl kanıtlıyorsunuz?",
    a: "Kurye teslimatta fotoğraf çeker ve teslim alan kişinin adını/imzasını alır. Teslim kanıtı sipariş kaydında saklanır.",
  },
  {
    q: "Nasıl ödeme yapabilirim?",
    a: "Uygulamadan kredi kartıyla (iyzico güvencesiyle) ödeyebilir veya teslimatta kuryeye ödeyebilirsiniz. Kurumsal müşterilerimize ay sonunda tek fatura kesilir.",
  },
  {
    q: "Fatura kesiyor musunuz?",
    a: "Evet, teslimattan sonra e-arşiv veya e-fatura otomatik olarak düzenlenir; faturanızı uygulamadaki sipariş sayfasından görüntüleyebilirsiniz.",
  },
  {
    q: "Kurumsal indirim var mı?",
    a: `Ayda ${S.corporateTiers[0]?.minDeliveries ?? 20}+ teslimatta %${S.corporateTiers[0]?.discountPct ?? 15}, ${S.corporateTiers[1]?.minDeliveries ?? 50}+ teslimatta %${S.corporateTiers[1]?.discountPct ?? 25} indirim uygulanır ve tüm ay tek faturada toplanır. Kurumsal sayfasından başvurabilirsiniz.`,
  },
  {
    q: "Hangi gönderileri taşımıyorsunuz?",
    a: `Yasal olarak taşınması yasak veya tehlikeli maddeler, nakit para, değerli mücevher ve canlı hayvan taşımıyoruz. Motosikletle en fazla ${S.maxWeightKg ?? 20} kg taşıyoruz; çantaya sığmayan büyük gönderiler için önceden bilgi verin.`,
  },
  {
    q: `${BRAND.name} uygulamasını indirmem gerekiyor mu?`,
    a: "Hayır. Tarayıcıdan da sipariş verebilirsiniz; telefon numaranızla tek kullanımlık kodla giriş yapmanız yeterli. Dilerseniz mobil uygulamayı da kullanabilirsiniz.",
  },
];
