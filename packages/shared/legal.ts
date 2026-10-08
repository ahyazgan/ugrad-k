// Yasal metinler — TEK KAYNAK (mobil uygulama, web sayfaları, asistan).
// Metin değiştiğinde KVKK_VERSION artırılır; kullanıcıdan yeniden onay alınır.
// Not: Nihai metinler bir hukukçu tarafından gözden geçirilmelidir.
import { BRAND } from "./brand.ts";

export const KVKK_VERSION = "2026-10-12";

export const COMPANY = {
  title: "YAZGAN TEKNOLOJİ LOJİSTİK TİCARET VE SANAYİ LTD. ŞTİ.",
  address: "Kılıçlı Mah. Şile Cad. No: 8A, Beykoz / İstanbul",
};

export const AYDINLATMA_METNI = `${COMPANY.title} ("${BRAND.name}") olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında veri sorumlusu sıfatıyla kişisel verilerinizi aşağıda açıklanan şekilde işliyoruz.

1. İşlenen veriler
• Kimlik ve iletişim: ad-soyad, cep telefonu, e-posta
• Gönderi bilgileri: alış ve teslim adresleri, adres konumları, alıcı/gönderici adı ve telefonu, paket açıklaması
• İşlem bilgileri: sipariş geçmişi, ödeme ve fatura bilgileri
• Teslim kanıtı: teslim fotoğrafı, alıcı imzası ve adı; teslim edilemezse adresin fotoğrafı
• Yazışmalar: kuryeyle uygulama içinden sipariş üzerine yazışmalar (iş bitiminden 90 gün sonra silinir)

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

// Kuryeler (çalışanlar) için ayrı aydınlatma: konum verisi yalnızca vardiya süresince işlenir.
export const KURYE_AYDINLATMA_METNI = `${COMPANY.title} olarak, kurye hizmetinin yürütülmesi kapsamında aşağıdaki verilerinizi işliyoruz:

• Kimlik ve iletişim: ad-soyad, telefon, araç plakası
• Vardiya kayıtları: başlangıç/bitiş zamanı ve konumu — 6475 sayılı Kanun ve BTK düzenlemeleri gereği kurye çalışma saatlerinin kayıt altına alınması (hukuki yükümlülük, KVKK m.5/2-ç)
• Konum: YALNIZCA vardiya açıkken; iş atama, müşteriye canlı takip ve teslimat güvenliği için (sözleşmenin ifası ve meşru menfaat, KVKK m.5/2-c ve f). Vardiya kapandığında konum toplanmaz.
• Teslim kanıtları: teslim fotoğrafı ve alıcı imzası; teslim edilemeyen işte adres fotoğrafı ve arama sayısı
• İş kayıtları: iş teklifi yanıtları, adrese varış zamanları (bekleme ölçümü), mola kayıtları, müşteriyle yazışmalar
• Acil durum: SOS bildirdiğinizde tür, not ve o anki konumunuz — güvenliğiniz için (hayati menfaat ve meşru menfaat, KVKK m.5/2-b ve f)

Molada elinizde iş yoksa konum toplanmaz. Konum geçmişi en fazla 6 ay, vardiya kayıtları mevzuatın öngördüğü süre boyunca saklanır. KVKK m.11 kapsamındaki haklarınız için ${COMPANY.address} adresine başvurabilirsiniz.`;

export const KURYE_KONUM_ONAYI = `Vardiyam açıkken konumumun işlenmesi ve aktif teslimat süresince müşteriyle paylaşılması hakkında bilgilendirildim.`;

export const CONTACT_EMAIL = BRAND.email.kvkk;

/** Gizlilik politikası (mağaza listelemeleri için herkese açık sayfa) */
export const GIZLILIK_POLITIKASI = `Bu politika, ${COMPANY.title} ("${BRAND.name}") tarafından sunulan ${BRAND.name} mobil uygulaması, web sayfaları ve WhatsApp/telefon/e-posta asistanı için geçerlidir.

Toplanan veriler
• Hesap: telefon numarası (giriş için), ad-soyad, e-posta (isteğe bağlı)
• Sipariş: alış/teslim adresleri ve konumları, gönderici/alıcı adı ve telefonu, paket açıklaması, notlar
• Ödeme: kartla ödemelerde kart bilgileri yalnızca iyzico tarafından işlenir; bize yalnızca ödeme sonucu ve işlem numarası iletilir
• Kuryeler: vardiya süresince konum, vardiya başlangıç/bitiş zamanları, teslim fotoğrafı ve alıcı imzası
• Cihaz: bildirim gönderebilmek için push bildirim anahtarı
• Asistan: WhatsApp, telefon veya e-posta asistanıyla yapılan yazışmalar
• Sipariş yazışmaları: uygulama içinde kurye ile müşteri arasındaki mesajlar (90 gün saklanır)
• Kurye iş kayıtları: teklif yanıtları, varış zamanları, molalar ve acil durum bildirimleri (konum dahil)
• Değerlendirme: teslimattan sonra verdiğiniz puan ve yorum
• Web formları: kurumsal başvuru/iletişim formunda verdiğiniz ad, firma, telefon, e-posta ve mesaj; kurye başvurusunda başvuru bilgileri ve yüklediğiniz belgeler
• Kurumsal API: API ile gönderilen sipariş bilgileri ve dış referans numaraları

Kullanım amaçları
Kurye hizmetinin sunulması, fiyat hesabı, kurye ataması, canlı takip, bildirimler, faturalandırma, müşteri desteği ve yasal yükümlülükler (6475 sayılı Posta Hizmetleri Kanunu, BTK düzenlemeleri, vergi mevzuatı). Verileriniz reklam amacıyla satılmaz veya paylaşılmaz.

Hizmet sağlayıcılar (veri işleyenler)
Supabase (veritabanı ve barındırma), Google Maps Platform (adres ve mesafe), iyzico (ödeme), Paraşüt (e-fatura/e-arşiv), Netgsm (SMS), Meta WhatsApp Business (mesajlaşma), Expo (push bildirim), Anthropic (yapay zeka asistanı), Postmark (e-posta), Vercel (web barındırma), OpenStreetMap veya seçilen harita karo sağlayıcısı (harita görüntüsü; tarayıcınızın IP adresi bu sağlayıcıya iletilir). Bazı sağlayıcıların sunucuları yurt dışındadır; aktarım KVKK'ya uygun şekilde yapılır.

Saklama süreleri
Sipariş ve fatura kayıtları vergi mevzuatı gereği 10 yıl; kurye konum geçmişi en fazla 6 ay; asistan yazışmaları 1 yıl; işe alınmayan kurye başvuruları ve belgeleri en fazla 1 yıl; sonuçlanan kurumsal başvurular 2 yıl saklanır. Süre sonunda silinir veya anonimleştirilir.

Haklarınız ve hesap silme
KVKK m.11 kapsamındaki haklarınızı ${CONTACT_EMAIL} adresine veya ${COMPANY.address} adresine yazılı olarak iletebilirsiniz. Hesabınızı uygulamada Hesabım → Hesabımı sil adımıyla dilediğiniz zaman silebilirsiniz.

Çocuklar
Hizmet 18 yaşından küçüklere yönelik değildir.

İletişim: ${CONTACT_EMAIL} · ${COMPANY.address}`;

export const HESAP_SILME = `${BRAND.name} hesabınızı iki yolla silebilirsiniz:

1. Uygulamadan: Hesabım → Hesabımı sil → Evet, hesabımı sil.
2. E-posta ile: Kayıtlı telefon numaranızla birlikte ${CONTACT_EMAIL} adresine "Hesap silme talebi" konulu bir e-posta gönderin. Talebiniz en geç 30 gün içinde sonuçlandırılır.

Silinen veriler: ad-soyad, telefon, e-posta, kayıtlı adresler, bildirim anahtarı, asistan yazışmaları ve (kuryeler için) konum geçmişi.
Saklanan veriler: geçmiş sipariş ve fatura kayıtları, vergi mevzuatı gereği 10 yıl boyunca anonim olarak; kurye vardiya kayıtları BTK yükümlülüğü süresince saklanır.

Devam eden bir siparişiniz varsa hesap, sipariş tamamlandıktan sonra silinebilir.`;


/** Web formları (kurumsal başvuru, iletişim) ve kurye başvurusu aydınlatması — sitede /kvkk sayfasında gösterilir */
export const BASVURU_AYDINLATMA = `Web sitemizdeki formlar aracılığıyla verdiğiniz bilgiler ${COMPANY.title} tarafından aşağıdaki şekilde işlenir:

• Kurumsal başvuru ve iletişim formu: ad-soyad, firma adı, telefon, e-posta, tahmini gönderi sayısı ve mesajınız; talebinizin değerlendirilmesi ve sizinle iletişime geçilmesi amacıyla (KVKK m.5/2-c sözleşme öncesi, m.5/2-f meşru menfaat). En fazla 2 yıl saklanır.
• Kurye başvurusu: ad-soyad, telefon, e-posta, ilçe, doğum yılı, ehliyet sınıfı, araç bilgileri, deneyim ve yüklediğiniz belgeler (ehliyet, ruhsat, vesikalık); işe alım sürecinin yürütülmesi amacıyla (KVKK m.5/2-c). Adli sicil gibi özel nitelikli veriler bu formda istenmez. İşe alınmamanız halinde en fazla 1 yıl sonra silinir.

Bu veriler yalnızca barındırma ve bildirim hizmeti sağlayıcılarımızla (Supabase, Vercel, SMS/WhatsApp) paylaşılır. KVKK m.11 kapsamındaki haklarınız için ${CONTACT_EMAIL} adresine yazabilirsiniz.`;
