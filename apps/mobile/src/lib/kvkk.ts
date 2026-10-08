// KVKK metinleri. Metin değiştiğinde VERSION artırılır; kullanıcıdan yeniden onay alınır.
// Not: Nihai metinler bir hukukçu tarafından gözden geçirilmelidir.
export const KVKK_VERSION = "2026-10-08";

export const COMPANY = {
  title: "YAZGAN TEKNOLOJİ LOJİSTİK TİCARET VE SANAYİ LTD. ŞTİ.",
  address: "Kılıçlı Mah. Şile Cad. No: 8A, Beykoz / İstanbul",
};

export const AYDINLATMA_METNI = `${COMPANY.title} ("Yazgan Kurye") olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında veri sorumlusu sıfatıyla kişisel verilerinizi aşağıda açıklanan şekilde işliyoruz.

1. İşlenen veriler
• Kimlik ve iletişim: ad-soyad, cep telefonu, e-posta
• Gönderi bilgileri: alış ve teslim adresleri, adres konumları, alıcı/gönderici adı ve telefonu, paket açıklaması
• İşlem bilgileri: sipariş geçmişi, ödeme ve fatura bilgileri
• Teslim kanıtı: teslim fotoğrafı, alıcı imzası ve adı

2. Amaçlar
Kurye hizmetinin sunulması, fiyatın hesaplanması, teslimatın takibi ve kanıtlanması, faturalandırma, müşteri desteği, yasal yükümlülüklerin (6475 sayılı Posta Hizmetleri Kanunu ve BTK düzenlemeleri, vergi mevzuatı) yerine getirilmesi.

3. Hukuki sebepler
KVKK m.5/2-c (sözleşmenin kurulması ve ifası), m.5/2-ç (hukuki yükümlülük), m.5/2-f (meşru menfaat). Açık rızaya dayanan işlemeler ayrıca açık rıza metninde belirtilmiştir.

4. Aktarım
Veriler; hizmetin yürütülmesi için kuryelerimize, altyapı sağlayıcılarımıza (barındırma, harita, SMS, ödeme ve e-fatura hizmetleri) ve yetkili kamu kurumlarına aktarılabilir. Bazı altyapı sağlayıcılarının sunucuları yurt dışında bulunabilir.

5. Saklama
Veriler ilgili mevzuatta öngörülen süreler (ör. vergi mevzuatı gereği 10 yıl) boyunca saklanır, süre sonunda silinir veya anonimleştirilir.

6. Haklarınız (KVKK m.11)
Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini isteme, itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz. Başvurularınızı ${COMPANY.address} adresine yazılı olarak iletebilirsiniz.`;

export const ACIK_RIZA_KONUM = `Siparişlerimin alınması, fiyatlandırılması ve teslim edilmesi için girdiğim adreslerin konum bilgisinin işlenmesine ve harita hizmet sağlayıcısına (Google) aktarılmasına; ayrıca teslimat süresince takip linki ile paylaşılmasına açık rıza veriyorum. Bu rızayı dilediğim zaman geri alabilirim; bu durumda yeni sipariş oluşturulamaz.`;

export const TICARI_ILETI = `Kampanya ve duyurular hakkında SMS, WhatsApp ve e-posta ile ticari elektronik ileti almak istiyorum. (İsteğe bağlı)`;
