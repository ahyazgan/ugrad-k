// Hizmet bölgeleri (ilçe sayfaları). Her ilçe için özgün kısa metin: arama motorları kopya içeriği sevmez.
// Anadolu yakası öncelikli; Avrupa yakasına teslimatlarda köprü geçiş ücreti eklenir.

export interface District {
  slug: string;
  name: string;
  side: "anadolu" | "avrupa";
  /** Sık gidilen mahalleler/semtler */
  areas: string[];
  /** İlçeye özgü tanıtım cümlesi */
  intro: string;
  /** Bu ilçede sık taşınan gönderi türleri */
  typical: string[];
}

export const DISTRICTS: District[] = [
  {
    slug: "beykoz",
    name: "Beykoz",
    side: "anadolu",
    areas: ["Kavacık", "Paşabahçe", "Çubuklu", "Anadoluhisarı", "Acarlar", "Kılıçlı"],
    intro:
      "Merkezimiz Beykoz'da. Kavacık'taki iş merkezlerinden Boğaz kıyısındaki ofislere kadar ilçenin her noktasına en kısa sürede ulaşıyoruz.",
    typical: ["Ofisler arası evrak", "Banka ve noter evrakı", "Numune ve küçük paket"],
  },
  {
    slug: "kadikoy",
    name: "Kadıköy",
    side: "anadolu",
    areas: ["Moda", "Fenerbahçe", "Göztepe", "Erenköy", "Bostancı", "Acıbadem", "Koşuyolu"],
    intro:
      "Kadıköy'ün yoğun trafiğinde moto kurye en hızlı seçenektir. Muayenehaneler, ajanslar ve ofisler arasında aynı saat içinde teslimat yapıyoruz.",
    typical: ["Ajans ve matbaa işleri", "Muayenehane ve laboratuvar gönderileri", "Sözleşme ve imza evrakı"],
  },
  {
    slug: "atasehir",
    name: "Ataşehir",
    side: "anadolu",
    areas: ["Barbaros", "Atatürk", "İçerenköy", "Küçükbakkalköy", "Kayışdağı"],
    intro:
      "Ataşehir'deki plazalar ve finans ofisleri için acil evrak teslimatı yapıyoruz; imzaya giden belgeler aynı gün geri dönebilir.",
    typical: ["Banka ve finans evrakı", "Plazalar arası belge", "Gidiş-dönüş imza turu"],
  },
  {
    slug: "uskudar",
    name: "Üsküdar",
    side: "anadolu",
    areas: ["Altunizade", "Acıbadem", "Çengelköy", "Kuzguncuk", "Beylerbeyi", "Ünalan"],
    intro:
      "Altunizade'deki iş merkezlerinden Boğaz semtlerine Üsküdar'ın her yerine moto kuryeyle hızlı teslimat yapıyoruz. Köprüye yakınlık Avrupa yakası işlerini de kısaltır.",
    typical: ["Hastane ve klinik gönderileri", "Ofis evrakı", "Avrupa yakasına acil geçiş"],
  },
  {
    slug: "umraniye",
    name: "Ümraniye",
    side: "anadolu",
    areas: ["Çakmak", "Ihlamurkuyu", "Yukarı Dudullu", "Esenşehir", "Atakent", "Şerifali"],
    intro:
      "Ümraniye ve Dudullu'daki şirket merkezleri, depolar ve organize sanayi bölgesi için gün içinde düzenli kurye hizmeti veriyoruz.",
    typical: ["Yedek parça ve numune", "Fatura ve irsaliye", "Depodan ofise acil ürün"],
  },
  {
    slug: "kartal",
    name: "Kartal",
    side: "anadolu",
    areas: ["Kordonboyu", "Soğanlık", "Yakacık", "Uğur Mumcu", "Atalar"],
    intro:
      "Kartal'daki İstanbul Anadolu Adliyesi'ne dosya ve dilekçe teslimi en sık yaptığımız işler arasında. Hukuk bürolarına süreli işlerde zamanında teslim sağlıyoruz.",
    typical: ["Adliyeye dosya ve dilekçe", "Avukatlık bürosu evrakı", "İcra dairesi belgeleri"],
  },
  {
    slug: "maltepe",
    name: "Maltepe",
    side: "anadolu",
    areas: ["Bağlarbaşı", "Altayçeşme", "Küçükyalı", "İdealtepe", "Cevizli", "Feyzullah"],
    intro:
      "Maltepe'den Anadolu Adliyesi'ne ve Kadıköy–Ataşehir hattına kısa sürede ulaşıyoruz. Sahil yolu ve E-5 arasındaki tüm iş yerlerine hizmet veriyoruz.",
    typical: ["Hukuk ve muhasebe evrakı", "Eczane ve sağlık gönderileri", "Küçük paket"],
  },
  {
    slug: "pendik",
    name: "Pendik",
    side: "anadolu",
    areas: ["Kurtköy", "Kaynarca", "Güzelyalı", "Yenişehir", "Esenyalı"],
    intro:
      "Kurtköy'deki iş merkezleri ve sanayi bölgelerinden İstanbul'un geri kalanına acil gönderileriniz için moto kurye sağlıyoruz.",
    typical: ["Sanayi numunesi ve yedek parça", "Ofis evrakı", "Kargo öncesi acil ulaştırma"],
  },
  {
    slug: "tuzla",
    name: "Tuzla",
    side: "anadolu",
    areas: ["Aydınlı", "İçmeler", "Postane", "Tuzla OSB", "Şifa"],
    intro:
      "Tuzla'daki tersaneler, organize sanayi ve lojistik firmaları için şehir içi acil parça ve belge taşıyoruz.",
    typical: ["Gümrük ve sevkiyat evrakı", "Acil yedek parça", "Numune"],
  },
  {
    slug: "cekmekoy",
    name: "Çekmeköy",
    side: "anadolu",
    areas: ["Taşdelen", "Alemdağ", "Ömerli"],
    intro:
      "Çekmeköy ve Taşdelen'den Ümraniye, Ataşehir ve Beykoz'a hızlı moto kurye bağlantısı sunuyoruz.",
    typical: ["Ofis evrakı", "Küçük paket", "Gidiş-dönüş işlemler"],
  },
  {
    slug: "sancaktepe",
    name: "Sancaktepe",
    side: "anadolu",
    areas: ["Samandıra", "Sarıgazi", "Yenidoğan"],
    intro:
      "Samandıra ve çevresindeki atölye ve işletmelerin acil gönderilerini Anadolu yakasının her noktasına taşıyoruz.",
    typical: ["Atölye numunesi", "Fatura ve irsaliye", "Küçük paket"],
  },
  {
    slug: "besiktas",
    name: "Beşiktaş",
    side: "avrupa",
    areas: ["Levent", "Etiler", "Gayrettepe", "Ortaköy", "Balmumcu", "Bebek"],
    intro:
      "Anadolu yakasından Levent ve Gayrettepe'deki plazalara günün her saati geçiş yapıyoruz; köprü geçişi fiyata şeffaf olarak eklenir.",
    typical: ["Plazalara sözleşme ve imza evrakı", "Banka genel müdürlüklerine belge", "Gidiş-dönüş imza turu"],
  },
  {
    slug: "sisli",
    name: "Şişli",
    side: "avrupa",
    areas: ["Mecidiyeköy", "Esentepe", "Fulya", "Nişantaşı", "Bomonti"],
    intro:
      "Mecidiyeköy ve Esentepe'deki iş merkezlerine Anadolu yakasından acil evrak ve paket götürüyoruz.",
    typical: ["Şirket evrakı", "Ajans ve medya teslimatları", "Numune"],
  },
  {
    slug: "sariyer",
    name: "Sarıyer",
    side: "avrupa",
    areas: ["Maslak", "İstinye", "Ayazağa", "Tarabya", "Emirgan"],
    intro:
      "Beykoz'dan köprüyle Maslak ve İstinye'ye en kısa sürede ulaşıyoruz. Maslak'taki şirket merkezlerine düzenli teslimat yapıyoruz.",
    typical: ["Genel müdürlük evrakı", "Teknoloji şirketlerine cihaz ve parça", "Gidiş-dönüş imza"],
  },
  {
    slug: "kagithane",
    name: "Kağıthane",
    side: "avrupa",
    areas: ["Çağlayan", "Talatpaşa", "Gürsel", "Hamidiye", "Merkez"],
    intro:
      "Çağlayan'daki İstanbul Adliyesi'ne Anadolu yakasındaki hukuk bürolarından dosya ve dilekçe teslimi yapıyoruz.",
    typical: ["Adliyeye dosya ve dilekçe", "İcra evrakı", "Avukatlık bürosu belgeleri"],
  },
  {
    slug: "beyoglu",
    name: "Beyoğlu",
    side: "avrupa",
    areas: ["Karaköy", "Cihangir", "Taksim", "Kasımpaşa", "Galata"],
    intro:
      "Karaköy ve Taksim çevresindeki ofis, ajans ve otellere Anadolu yakasından acil gönderi taşıyoruz.",
    typical: ["Ajans ve tasarım işleri", "Otel ve etkinlik teslimatları", "Evrak"],
  },
];

export const districtBySlug = (slug: string) => DISTRICTS.find((d) => d.slug === slug);
