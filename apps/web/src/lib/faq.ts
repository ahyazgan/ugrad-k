import { BRAND, type PricingSettings } from "@yazgan/shared";
import { bridgeRuleText, corporateTiers, economyWindowText, hh, tl } from "@/lib/pricing-info";

export type FaqCategory = "fiyat" | "teslimat" | "odeme" | "kurumsal";

export const FAQ_CATEGORIES: Array<{ id: FaqCategory; label: string }> = [
  { id: "fiyat", label: "Fiyat" },
  { id: "teslimat", label: "Teslimat" },
  { id: "odeme", label: "Ödeme ve fatura" },
  { id: "kurumsal", label: "Kurumsal" },
];

export interface FaqItem {
  q: string;
  a: string;
  category: FaqCategory;
}

/**
 * FAQ built from the given tariff (live pricing_settings or defaults), so answers and the FAQPage
 * JSON-LD never drift from the prices. Order matters: the home page shows the first five questions.
 */
export function faqItems(S: PricingSettings): FaqItem[] {
  const corporate = corporateTiers(S)
    .map((t) => `${t.minDeliveries}+ teslimatta %${t.discountPct.toLocaleString("tr-TR")}`)
    .join(", ");
  return [
    {
      category: "fiyat",
      q: "Fiyat nasıl hesaplanıyor?",
      a: `Alış ve teslim adresleri arasındaki gerçek sürüş mesafesine göre. İlk ${S.includedKm} km açılış ücretine dahildir; sonrası kademeli km ücretiyle eklenir. Acil, gece, Pazar, gidiş-dönüş ve büyük paket gibi ek ücretler fiyat özetinde tek tek gösterilir; gizli ücret yoktur. Fiyatlara KDV (%${S.vatPct}) eklenir.`,
    },
    {
      category: "teslimat",
      q: "Kurye ne kadar sürede gelir?",
      a: "Siparişiniz onaylanır onaylanmaz alış noktasına en yakın uygun kuryeye otomatik olarak atanır. Acil seçeneğinde 60 dakika içinde teslim taahhüt edilir; gönderiniz alındıktan sonra başka iş yapılmadan doğrudan teslim edilir. Taahhüdü kaçırırsak acil ek ücreti sonraki siparişinizden otomatik düşülür. Takip bağlantısında tahmini teslim saati görünür.",
    },
    {
      category: "fiyat",
      q: "Ekonomi gönderi nedir?",
      a: `Acelesi olmayan gönderiler için %${S.economyDiscountPct} indirimli seçenek: ${economyWindowText(S)} arasında alınan gönderiler (resmi tatiller hariç) aynı gün içinde, aynı yöne giden işlerle birlikte teslim edilir. Uygunluk siparişin verildiği saate değil, kuryenin gönderiyi alacağı saate göre belirlenir.`,
    },
    {
      category: "teslimat",
      q: "Avrupa yakasına teslimat yapıyor musunuz?",
      a: `Evet. ${bridgeRuleText(S)} Ücret fiyat özetinde ayrı satırda görünür.`,
    },
    {
      category: "teslimat",
      q: "Gönderimi nasıl takip ederim?",
      a: "Sipariş verdiğinizde size ve isterseniz alıcıya canlı takip bağlantısı gönderilir. Kuryenin konumunu haritada görebilirsiniz.",
    },
    {
      category: "teslimat",
      q: "Teslim edildiğini nasıl kanıtlıyorsunuz?",
      a: "Kurye teslimatta fotoğraf çeker ve teslim alan kişinin adını/imzasını alır. Teslim kanıtı sipariş kaydında saklanır.",
    },
    {
      category: "odeme",
      q: "Nasıl ödeme yapabilirim?",
      a: "Uygulamadan kredi kartıyla (iyzico güvencesiyle) ödeyebilir veya teslimatta kuryeye ödeyebilirsiniz. Kurumsal müşterilerimize ay sonunda tek fatura kesilir.",
    },
    {
      category: "odeme",
      q: "Fatura kesiyor musunuz?",
      a: "Evet, teslimattan sonra e-arşiv veya e-fatura otomatik olarak düzenlenir; faturanızı uygulamadaki sipariş sayfasından görüntüleyebilirsiniz.",
    },
    {
      category: "kurumsal",
      q: "Kurumsal indirim var mı?",
      a: corporate
        ? `Evet. Ayda ${corporate} indirim uygulanır ve tüm ay tek faturada toplanır. Kurumsal sayfasından başvurabilirsiniz.`
        : "Kurumsal hesaplarda tüm ay tek faturada toplanır. Kurumsal sayfasından başvurabilirsiniz.",
    },
    {
      category: "teslimat",
      q: "Hangi gönderileri taşımıyorsunuz?",
      a: `Yasal olarak taşınması yasak veya tehlikeli maddeler, nakit para, değerli mücevher ve canlı hayvan taşımıyoruz. ${S.maxWeightKg != null ? `Motosikletle en fazla ${S.maxWeightKg} kg taşıyoruz;` : "Motosikletle taşınabilecek boyutta gönderileri alıyoruz;"} çantaya sığmayan büyük gönderiler için önceden bilgi verin.`,
    },
    {
      category: "teslimat",
      q: `${BRAND.name} uygulamasını indirmem gerekiyor mu?`,
      a: "Hayır. Tarayıcıdan da sipariş verebilirsiniz; telefon numaranızla tek kullanımlık kodla giriş yapmanız yeterli. Dilerseniz mobil uygulamayı da kullanabilirsiniz.",
    },
    {
      category: "fiyat",
      q: "Gece, Pazar veya resmi tatilde fiyat değişir mi?",
      a: `Evet. Gece (${hh(S.nightStartHour)}–${hh(S.nightEndHour)}) %${S.nightSurchargePct}, Pazar %${S.sundaySurchargePct}, resmi tatil %${S.nightHolidaySurchargePct} ek ücretlidir; arife günleri ${hh(S.halfDayStartHour)}'ten itibaren tatil sayılır. Bu ekler birlikte gelirse toplanmaz, yalnızca en yükseği uygulanır.${S.maxSurchargePct != null ? ` Acil ile birlikte ek ücretlerin toplamı en fazla %${S.maxSurchargePct} olur.` : ""}`,
    },
    {
      category: "fiyat",
      q: "Kurye alışta beklerse ücret alınır mı?",
      a: `İlk ${S.waitingFreeMinutes} dakika ücretsizdir. Sonrasında başlayan her ${S.waitingBlockMinutes} dakika için ${tl(S.waitingBlockFeeKurus)} eklenir; bekleme ücreti teslimattan sonra gerçek süreyle hesaplanır.`,
    },
    {
      category: "kurumsal",
      q: "E-postayla sipariş verebilir miyim?",
      a: `Evet. Kayıtlı müşterilerimiz alış ve teslim adresini ${BRAND.email.orders} adresine yazarak sipariş verebilir.`,
    },
    {
      category: "kurumsal",
      q: "Kendi yazılımımızı bağlayabilir miyiz?",
      a: "Evet. Kurumsal hesaplar API ile fiyat alıp sipariş açabilir ve sipariş durumu değiştikçe webhook bildirimi alabilir. Ayrıntılar Kurumsal API belgelerinde.",
    },
  ];
}
