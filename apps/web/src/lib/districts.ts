// Hizmet bölgeleri (ilçe sayfaları). Her ilçe için özgün kısa metin: arama motorları kopya içeriği sevmez.
// Anadolu yakası öncelikli; Avrupa yakasına teslimatlarda köprü geçiş ücreti eklenir.

export interface District {
  slug: string;
  name: string;
  side: "anadolu" | "avrupa";
  /** Yaklaşık ilçe merkezi; yalnız ilçe sayfasındaki tahmini örnek fiyat için (gerçek fiyat adreslerden hesaplanır) */
  center: { lat: number; lng: number };
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
    center: { lat: 41.1340, lng: 29.0920 },
    areas: ["Kavacık", "Paşabahçe", "Çubuklu", "Anadoluhisarı", "Acarlar", "Kılıçlı"],
    intro:
      "Merkezimiz Beykoz'da. Kavacık'taki iş merkezlerinden Boğaz kıyısındaki ofislere kadar ilçenin her noktasına en kısa sürede ulaşıyoruz.",
    typical: ["Ofisler arası evrak", "Banka ve noter evrakı", "Numune ve küçük paket"],
  },
  {
    slug: "kadikoy",
    name: "Kadıköy",
    side: "anadolu",
    center: { lat: 40.9903, lng: 29.0290 },
    areas: ["Moda", "Fenerbahçe", "Göztepe", "Erenköy", "Bostancı", "Acıbadem", "Koşuyolu"],
    intro:
      "Kadıköy'ün yoğun trafiğinde moto kurye en hızlı seçenektir. Muayenehaneler, ajanslar ve ofisler arasında aynı saat içinde teslimat yapıyoruz.",
    typical: ["Ajans ve matbaa işleri", "Muayenehane ve laboratuvar gönderileri", "Sözleşme ve imza evrakı"],
  },
  {
    slug: "atasehir",
    name: "Ataşehir",
    side: "anadolu",
    center: { lat: 40.9833, lng: 29.1167 },
    areas: ["Barbaros", "Atatürk", "İçerenköy", "Küçükbakkalköy", "Kayışdağı"],
    intro:
      "Ataşehir'deki plazalar ve finans ofisleri için acil evrak teslimatı yapıyoruz; imzaya giden belgeler aynı gün geri dönebilir.",
    typical: ["Banka ve finans evrakı", "Plazalar arası belge", "Gidiş-dönüş imza turu"],
  },
  {
    slug: "uskudar",
    name: "Üsküdar",
    side: "anadolu",
    center: { lat: 41.0227, lng: 29.0150 },
    areas: ["Altunizade", "Acıbadem", "Çengelköy", "Kuzguncuk", "Beylerbeyi", "Ünalan"],
    intro:
      "Altunizade'deki iş merkezlerinden Boğaz semtlerine Üsküdar'ın her yerine moto kuryeyle hızlı teslimat yapıyoruz. Köprüye yakınlık Avrupa yakası işlerini de kısaltır.",
    typical: ["Hastane ve klinik gönderileri", "Ofis evrakı", "Avrupa yakasına acil geçiş"],
  },
  {
    slug: "umraniye",
    name: "Ümraniye",
    side: "anadolu",
    center: { lat: 41.0256, lng: 29.0963 },
    areas: ["Çakmak", "Ihlamurkuyu", "Yukarı Dudullu", "Esenşehir", "Atakent", "Şerifali"],
    intro:
      "Ümraniye ve Dudullu'daki şirket merkezleri, depolar ve organize sanayi bölgesi için gün içinde düzenli kurye hizmeti veriyoruz.",
    typical: ["Yedek parça ve numune", "Fatura ve irsaliye", "Depodan ofise acil ürün"],
  },
  {
    slug: "kartal",
    name: "Kartal",
    side: "anadolu",
    center: { lat: 40.8889, lng: 29.1856 },
    areas: ["Kordonboyu", "Soğanlık", "Yakacık", "Uğur Mumcu", "Atalar"],
    intro:
      "Kartal'daki İstanbul Anadolu Adliyesi'ne dosya ve dilekçe teslimi en sık yaptığımız işler arasında. Hukuk bürolarına süreli işlerde zamanında teslim sağlıyoruz.",
    typical: ["Adliyeye dosya ve dilekçe", "Avukatlık bürosu evrakı", "İcra dairesi belgeleri"],
  },
  {
    slug: "maltepe",
    name: "Maltepe",
    side: "anadolu",
    center: { lat: 40.9350, lng: 29.1310 },
    areas: ["Bağlarbaşı", "Altayçeşme", "Küçükyalı", "İdealtepe", "Cevizli", "Feyzullah"],
    intro:
      "Maltepe'den Anadolu Adliyesi'ne ve Kadıköy–Ataşehir hattına kısa sürede ulaşıyoruz. Sahil yolu ve E-5 arasındaki tüm iş yerlerine hizmet veriyoruz.",
    typical: ["Hukuk ve muhasebe evrakı", "Eczane ve sağlık gönderileri", "Küçük paket"],
  },
  {
    slug: "pendik",
    name: "Pendik",
    side: "anadolu",
    center: { lat: 40.8775, lng: 29.2353 },
    areas: ["Kurtköy", "Kaynarca", "Güzelyalı", "Yenişehir", "Esenyalı"],
    intro:
      "Kurtköy'deki iş merkezleri ve sanayi bölgelerinden İstanbul'un geri kalanına acil gönderileriniz için moto kurye sağlıyoruz.",
    typical: ["Sanayi numunesi ve yedek parça", "Ofis evrakı", "Kargo öncesi acil ulaştırma"],
  },
  {
    slug: "tuzla",
    name: "Tuzla",
    side: "anadolu",
    center: { lat: 40.8161, lng: 29.3006 },
    areas: ["Aydınlı", "İçmeler", "Postane", "Tuzla OSB", "Şifa"],
    intro:
      "Tuzla'daki tersaneler, organize sanayi ve lojistik firmaları için şehir içi acil parça ve belge taşıyoruz.",
    typical: ["Gümrük ve sevkiyat evrakı", "Acil yedek parça", "Numune"],
  },
  {
    slug: "cekmekoy",
    name: "Çekmeköy",
    side: "anadolu",
    center: { lat: 41.0347, lng: 29.1792 },
    areas: ["Taşdelen", "Alemdağ", "Ömerli"],
    intro:
      "Çekmeköy ve Taşdelen'den Ümraniye, Ataşehir ve Beykoz'a hızlı moto kurye bağlantısı sunuyoruz.",
    typical: ["Ofis evrakı", "Küçük paket", "Gidiş-dönüş işlemler"],
  },
  {
    slug: "sancaktepe",
    name: "Sancaktepe",
    side: "anadolu",
    center: { lat: 41.0003, lng: 29.2307 },
    areas: ["Samandıra", "Sarıgazi", "Yenidoğan"],
    intro:
      "Samandıra ve çevresindeki atölye ve işletmelerin acil gönderilerini Anadolu yakasının her noktasına taşıyoruz.",
    typical: ["Atölye numunesi", "Fatura ve irsaliye", "Küçük paket"],
  },
  {
    slug: "besiktas",
    name: "Beşiktaş",
    side: "avrupa",
    center: { lat: 41.0430, lng: 29.0070 },
    areas: ["Levent", "Etiler", "Gayrettepe", "Ortaköy", "Balmumcu", "Bebek"],
    intro:
      "Anadolu yakasından Levent ve Gayrettepe'deki plazalara günün her saati geçiş yapıyoruz; köprü geçişi fiyata şeffaf olarak eklenir.",
    typical: ["Plazalara sözleşme ve imza evrakı", "Banka genel müdürlüklerine belge", "Gidiş-dönüş imza turu"],
  },
  {
    slug: "sisli",
    name: "Şişli",
    side: "avrupa",
    center: { lat: 41.0602, lng: 28.9877 },
    areas: ["Mecidiyeköy", "Esentepe", "Fulya", "Nişantaşı", "Bomonti"],
    intro:
      "Mecidiyeköy ve Esentepe'deki iş merkezlerine Anadolu yakasından acil evrak ve paket götürüyoruz.",
    typical: ["Şirket evrakı", "Ajans ve medya teslimatları", "Numune"],
  },
  {
    slug: "sariyer",
    name: "Sarıyer",
    side: "avrupa",
    center: { lat: 41.1677, lng: 29.0503 },
    areas: ["Maslak", "İstinye", "Ayazağa", "Tarabya", "Emirgan"],
    intro:
      "Beykoz'dan köprüyle Maslak ve İstinye'ye en kısa sürede ulaşıyoruz. Maslak'taki şirket merkezlerine düzenli teslimat yapıyoruz.",
    typical: ["Genel müdürlük evrakı", "Teknoloji şirketlerine cihaz ve parça", "Gidiş-dönüş imza"],
  },
  {
    slug: "kagithane",
    name: "Kağıthane",
    side: "avrupa",
    center: { lat: 41.0810, lng: 28.9732 },
    areas: ["Çağlayan", "Talatpaşa", "Gürsel", "Hamidiye", "Merkez"],
    intro:
      "Çağlayan'daki İstanbul Adliyesi'ne Anadolu yakasındaki hukuk bürolarından dosya ve dilekçe teslimi yapıyoruz.",
    typical: ["Adliyeye dosya ve dilekçe", "İcra evrakı", "Avukatlık bürosu belgeleri"],
  },
  {
    slug: "beyoglu",
    name: "Beyoğlu",
    side: "avrupa",
    center: { lat: 41.0370, lng: 28.9770 },
    areas: ["Karaköy", "Cihangir", "Taksim", "Kasımpaşa", "Galata"],
    intro:
      "Karaköy ve Taksim çevresindeki ofis, ajans ve otellere Anadolu yakasından acil gönderi taşıyoruz.",
    typical: ["Ajans ve tasarım işleri", "Otel ve etkinlik teslimatları", "Evrak"],
  },
];

export const districtBySlug = (slug: string) => DISTRICTS.find((d) => d.slug === slug);
