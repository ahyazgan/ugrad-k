// DEMO modunda panel testi: giriş → genel bakış → sipariş atama/durum → kuryeler → BTK → kurumsal → fiyatlar.
// Kullanım: pnpm --filter @yazgan/admin build && pnpm --filter @yazgan/admin e2e:web
const { chromium } = require("playwright");
const fs = require("fs");
const out = process.argv[2] || "e2e/shots";
const base = `http://localhost:${process.env.PORT || 3100}`;
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, fullPage: true });
  const nav = (label) => page.getByRole("link", { name: label, exact: true }).click();

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

  await nav("Kuryeler");
  await page.getByLabel("Ad Soyad").fill("Can Test");
  await page.getByLabel("Cep telefonu").fill("05551234567");
  await page.getByLabel("Plaka").fill("34 TST 99");
  await page.getByRole("button", { name: "Kurye ekle" }).click();
  await page.getByText("Can Test").waitFor();
  await shot("04-kuryeler");

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
  await shot("06-kurumsal");

  await nav("Fiyatlar");
  const perKm = page.getByLabel("Ek km ücreti (TL)");
  await perKm.waitFor();
  await perKm.fill("25");
  await page.getByText("Tarife").first().waitFor();
  await shot("07-fiyatlar");
  const preview = await page.locator("table").first().innerText();
  console.log("ONIZLEME", preview.replace(/\n/g, " | ").slice(0, 400));
  await page.getByRole("button", { name: "Tarifeyi kaydet" }).click();
  await page.getByText("Kaydedildi").waitFor();

  if (errors.length) throw new Error("Tarayıcı hataları: " + JSON.stringify(errors.slice(0, 10)));
  console.log("✓ panel e2e akışı geçti");
  await browser.close();
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
