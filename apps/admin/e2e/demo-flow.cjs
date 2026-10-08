// DEMO modunda panel testi: giriş → genel bakış → sipariş atama/durum → kuryeler → BTK → kurumsal → fiyatlar.
// Kullanım: pnpm --filter @yazgan/admin build && pnpm --filter @yazgan/admin e2e:web
const { chromium } = require("playwright");
const fs = require("fs");
const { stubTiles } = require("../../../scripts/e2e-tile-stub.cjs");
const out = process.argv[2] || "e2e/shots";
const base = `http://localhost:${process.env.PORT || 3100}`;
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const tiles = await stubTiles(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, fullPage: true });
  const nav = (label) => page.getByRole("navigation").getByRole("link", { name: label, exact: true }).click();

  await page.goto(base + "/");
  await page.waitForURL("**/giris");
  await page.getByLabel("E-posta").fill("admin@yazgankurye.com");
  await page.getByLabel("Şifre").fill("yanlis");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.getByText("Demo girişi").waitFor();
  await page.getByLabel("Şifre").fill("demo1234");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.getByRole("heading", { name: "Genel bakış" }).waitFor();
  await page.getByText("İşlem bekleyen siparişler").waitFor();
  await shot("01-genel-bakis");

  // Beklemedeki siparişi aç, kurye ata, alındı → yolda → teslim
  await page.getByRole("link", { name: /^YK-\d+$/ }).first().click();
  await page.getByText("Kurye ata").waitFor();
  const select = page.getByLabel("Kurye ata");
  await select.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Ata" }).click();
  await page.getByText("Kuryeye atandı", { exact: true }).first().waitFor();
  for (const s of ["Alındı", "Yolda", "Teslim edildi"]) {
    await page.getByRole("button", { name: `→ ${s}` }).click();
    await page.getByText(s, { exact: true }).first().waitFor();
  }
  await page.getByText("Teslim kanıtı").waitFor();
  await shot("02-siparis-teslim");

  await nav("Siparişler");
  await page.getByRole("button", { name: "Tümü" }).click();
  await page.getByRole("button", { name: "Filtrele" }).click();
  await page.getByText(/\d+ sipariş/).waitFor();
  await shot("03-siparisler");

  // ───── Telefon siparişi: kayıtlı müşteri, son adresten seçim
  await page.getByRole("link", { name: "+ Telefon siparişi" }).click();
  const t = (id) => page.getByTestId(id);
  await t("phone").fill("0532 111 22 33");
  await t("lookup").click();
  await page.getByText("Kayıtlı müşteri").waitFor();
  if ((await t("full-name").inputValue()) !== "Ayşe Yılmaz") throw new Error("müşteri adı gelmedi");
  await page.getByRole("button", { name: /↺ .*Kadıköy/ }).first().click(); // alış: son adres
  await t("dropoff-search").fill("levent");
  await t("dropoff-suggestion-0").click();
  await t("dropoff-details").fill("Kanyon B Blok");
  await t("opt-urgent").check();
  await t("total").waitFor();
  console.log("TELEFON FIYAT", await t("total").innerText());
  await shot("03b-telefon-siparisi");
  await t("submit").click();
  await page.getByText("Telefon siparişi", { exact: true }).waitFor(); // geçmiş notu
  await page.getByText("Kanyon B Blok").waitFor();

  // Yeni müşteri: sözlü KVKK onayı olmadan gönderilemez
  await nav("Siparişler");
  await page.getByRole("link", { name: "+ Telefon siparişi" }).click();
  await t("phone").fill("0533 999 88 77");
  await t("lookup").click();
  await page.getByText("Yeni müşteri", { exact: false }).waitFor();
  await t("full-name").fill("Deniz Yeni");
  await t("pickup-search").fill("üsküdar");
  await t("pickup-suggestion-0").click();
  await t("dropoff-search").fill("ataşehir");
  await t("dropoff-suggestion-0").click();
  await t("total").waitFor();
  if (await t("submit").isEnabled()) throw new Error("onaysız gönderim engellenmeli");
  await t("consent").check();
  await t("submit").click();
  await page.getByText("Telefon siparişi", { exact: true }).waitFor();
  await page.getByText("Deniz Yeni").first().waitFor();

  await nav("Kuryeler");
  await page.getByLabel("Ad Soyad").fill("Can Test");
  await page.getByLabel("Cep telefonu").fill("05551234567");
  await page.getByLabel("Plaka").fill("34 TST 99");
  await page.getByRole("button", { name: "Kurye ekle" }).click();
  await page.getByText("Can Test").waitFor();
  await shot("04-kuryeler");

  // ───── Başvurular: web sitesinden gelen müşteri ve kurye başvuruları
  await nav("Başvurular");
  await page.getByText("Kadıköy Mali Müşavirlik").waitFor();
  await page.getByTestId("lead-lead-1").getByLabel("Durum").selectOption("arandi");
  await page.getByRole("tab", { name: "Kurye başvuruları" }).click();
  await page.getByTestId("application-app-1").waitFor();
  await page.getByRole("button", { name: "Ehliyet (ön)" }).waitFor();
  await shot("04b-basvurular");
  await page.getByTestId("approve-app-1").click();
  await page.getByText("Kurye hesabı açıldı.").waitFor();
  await nav("Kuryeler");
  await page.getByText("Okan Yıldız").waitFor();

  await nav("Çalışma saatleri (BTK)");
  await page.getByRole("heading", { name: "Kurye çalışma saatleri" }).waitFor();
  await page.getByLabel("Başlangıç").fill("2026-01-01");
  await page.getByText("Devam ediyor").first().waitFor();
  await shot("05-vardiyalar");

  await nav("Kurumsal & fatura");
  await page.getByLabel("Hesap").selectOption({ label: "Beykoz Hukuk Bürosu" });
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Hesapla" }).click();
    await page.getByText("Genel toplam (KDV dahil)").waitFor();
    const txt = await page.locator("dl").first().innerText();
    console.log("EKSTRE", (await page.getByLabel("Ay").inputValue()), txt.replace(/\n/g, " | "));
    if (/%(15|25)/.test(txt)) break;
    // önceki aya geç (demo verisi ~20 gün geriye yayılıyor)
    const [y, m] = (await page.getByLabel("Ay").inputValue()).split("-").map(Number);
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    await page.getByLabel("Ay").fill(prev);
  }
  await page.getByRole("button", { name: "Faturayı oluştur" }).click();
  await page.getByText("Fatura kuyruğa alındı").waitFor();
  await shot("06-kurumsal");
  await nav("Faturalar");
  await page.getByText(/^Aylık \d{4}-\d{2}$/).waitFor();
  await shot("06b-faturalar");

  await nav("Asistan konuşmaları");
  await page.getByText("Temsilci bekliyor").waitFor();
  await page.getByRole("button", { name: "Yazışma" }).first().click();
  await page.getByText("köşesi ezilmiş", { exact: false }).waitFor();
  await shot("06c-asistan");

  // ───── Otomasyon: şimdi dağıt → bekleyen siparişler onaylanır, vardiyadaki kuryeye atanır
  await nav("Otomasyon");
  await page.getByTestId("run-dispatch").click();
  const res = await page.getByTestId("dispatch-result").innerText();
  console.log("DAGITIM", res);
  if (!/\d+ sipariş kuryeye atandı/.test(res) || /^0 sipariş onaylandı · 0 sipariş kuryeye/.test(res)) throw new Error("dağıtım bir şey yapmadı: " + res);
  await shot("06d-otomasyon");

  // ───── Canlı harita: kurye ve sipariş işaretleri, açılır kutu, odaklama
  await nav("Canlı harita");
  await page.locator('[data-pin="kurye:kur-1"]').waitFor();
  const pinCount = await page.locator("[data-pin]").count();
  console.log("HARITA isaret:", pinCount, "karo:", tiles.count);
  if (pinCount < 4 || !tiles.count) throw new Error("harita eksik çizildi");
  await page.locator('[data-pin="kurye:kur-1"]').click();
  await page.locator(".leaflet-popup-content").getByText("Mehmet Kaya").waitFor();
  await page.getByTestId("map-couriers").getByRole("button", { name: "Göster" }).first().click();
  await page.waitForTimeout(800); // flyTo animasyonu
  await shot("06d2-harita");

  // ───── Raporlar: özet kutuları, grafik ipucu, tablo görünümü, CSV
  await nav("Raporlar");
  const totals = page.getByTestId("report-totals");
  await totals.waitFor();
  const totalsTxt = await totals.innerText();
  console.log("RAPOR", totalsTxt.replace(/\n/g, " | ").slice(0, 300));
  if (/Ciro \(KDV hariç\)\s*0,00 TL/.test(totalsTxt)) throw new Error("rapor cirosu boş");
  const chart = page.getByRole("img", { name: "Günlük ciro" });
  const box = await chart.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
  const tip = await page.getByRole("tooltip").innerText();
  if (!/teslimat\n[\d.,]+ TL/.test(tip)) throw new Error("grafik ipucu hatalı: " + tip);
  await shot("06e-raporlar");
  await page.getByRole("button", { name: "Tablo" }).first().click();
  await page.locator("th", { hasText: /^Gün$/ }).waitFor();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("csv").click()]);
  const csvPath = `${out}/rapor.csv`;
  await dl.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, "utf8");
  if (!csv.startsWith("\uFEFFSipariş no;") || csv.trim().split("\n").length < 10) throw new Error("CSV hatalı");
  await page.getByRole("button", { name: "Son 7 gün" }).click();
  await totals.waitFor();

  await nav("Fiyatlar");
  const kmTiers = page.getByLabel("Km kademeleri (toplam km'ye kadar : TL/km)");
  await kmTiers.waitFor();
  if ((await kmTiers.inputValue()) !== "10:25, *:18") throw new Error("varsayılan kademeler yüklenmedi");
  await kmTiers.fill("10:22, *:16");
  await page.getByText("Tarife").first().waitFor();
  await shot("07-fiyatlar");
  const preview = await page.locator("table").first().innerText();
  console.log("ONIZLEME", preview.replace(/\n/g, " | ").slice(0, 400));
  await page.getByRole("button", { name: "Tarifeyi kaydet" }).click();
  await page.getByText("Kaydedildi").waitFor();
  // Geçersiz kademe kaydı engellenir
  await kmTiers.fill("abc");
  await page.getByText("Geçersiz alanlar: Km kademeleri").waitFor();
  // İlk tarifeye tek tıkla dönüş
  await page.getByRole("button", { name: /İlk tarifeyi yükle/ }).click();
  if ((await kmTiers.inputValue()) !== "") throw new Error("ilk tarife yüklenmedi");

  // Herkese açık takip sayfası: oturum gerekmez
  const pubCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await stubTiles(pubCtx);
  const pub = await pubCtx.newPage();
  pub.on("pageerror", (e) => errors.push(e.message));
  await pub.goto(base + "/takip/demo0000000000000000000000000000");
  await pub.getByText("Gönderi takibi · YK-1001").waitFor();
  await pub.getByText("Kuryemiz Mehmet gönderinizi getiriyor.").waitFor();
  await pub.locator('[data-pin="kurye"]').waitFor();
  await pub.locator('[data-pin="teslim"]').waitFor();
  await pub.screenshot({ path: `${out}/08-takip.png`, fullPage: true });
  await pub.goto(base + "/takip/gecersiz");
  await pub.getByText("Gönderi bulunamadı").waitFor();
  if (pub.url().includes("/giris")) throw new Error("takip sayfası girişe yönlendirdi");
  for (const [path, text] of [["/gizlilik", "Toplanan veriler"], ["/kvkk", "İşlenen veriler"], ["/hesap-silme", "Hesabımı sil"]]) {
    await pub.goto(base + path);
    await pub.getByText(text, { exact: false }).first().waitFor();
    if (pub.url().includes("/giris")) throw new Error(path + " girişe yönlendirdi");
  }

  if (errors.length) throw new Error("Tarayıcı hataları: " + JSON.stringify(errors.slice(0, 10)));
  console.log("✓ panel e2e akışı geçti");
  await browser.close();
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
