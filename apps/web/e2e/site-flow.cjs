// DEMO modunda site testi: fiyat hesaplama, tarife, kurumsal başvuru, ilçe sayfası, sitemap, yapılandırılmış veri.
// Kullanım: pnpm --filter @yazgan/web build && pnpm --filter @yazgan/web e2e:web
const { chromium } = require("playwright");
const fs = require("fs");
const out = process.argv[2] || "e2e/shots";
const base = `http://localhost:${process.env.PORT || 3300}`;
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const errors = [];
  const watch = (p) => {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => m.type() === "error" && errors.push(m.text() + " " + (m.location()?.url ?? "")));
    p.on("response", (r) => r.status() === 404 && !r.url().includes("/hizmet-bolgeleri/yok") && errors.push("404 " + r.url()));
  };
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  watch(page);
  const t = (id) => page.getByTestId(id);

  await page.goto(base + "/");
  await page.getByRole("heading", { level: 1 }).waitFor();
  // Fiyat hesaplama: adres önerisi → seç → fiyat
  await t("pickup-input").fill("beykoz");
  await t("pickup-option-0").click();
  await t("dropoff-input").fill("levent");
  await t("dropoff-option-0").click();
  await t("total").waitFor();
  const normal = await t("total").innerText();
  await page.locator('label:has([data-testid="level-acil"])').click();
  await page.waitForFunction((prev) => document.querySelector('[data-testid="total"]')?.textContent !== prev, normal);
  const urgent = await t("total").innerText();
  console.log("FIYAT normal:", normal, "acil:", urgent);
  const n = (s) => Number(s.replace(/[^\d,]/g, "").replace(",", "."));
  if (!(n(urgent) > n(normal))) throw new Error("acil fiyat yükselmeli");
  await page.getByText("Fiyat dökümü").click();
  await page.getByText(/Köprü/).first().waitFor();
  await page.screenshot({ path: `${out}/01-ana-sayfa.png`, fullPage: true });

  // Klavye ile seçim
  await page.goto(base + "/fiyatlar");
  await t("tariff").waitFor();
  const tariff = await t("tariff").innerText();
  if (!/Açılış/.test(tariff) || !/km başına/.test(tariff)) throw new Error("tarife tablosu eksik");
  await t("pickup-input").fill("kadık");
  await t("pickup-option-0").waitFor();
  await t("pickup-input").press("Enter");
  await t("dropoff-input").fill("ataşehir");
  await t("dropoff-option-0").waitFor();
  await t("dropoff-input").press("ArrowDown");
  await t("dropoff-input").press("Enter");
  await t("total").waitFor();
  await page.screenshot({ path: `${out}/02-fiyatlar.png`, fullPage: true });

  // Kurumsal başvuru: onaysız gönderilemez
  await page.goto(base + "/kurumsal");
  await t("lead-company").fill("Örnek Hukuk Bürosu");
  await t("lead-name").fill("Av. Deniz Kaya");
  await t("lead-phone").fill("0216 555 44 33");
  await t("lead-volume").selectOption("20-50");
  await t("lead-submit").click();
  await page.getByText("Aydınlatma metnini onaylamanız gerekiyor").waitFor();
  await t("lead-consent").check();
  await t("lead-submit").click();
  await t("lead-done").waitFor();
  await page.screenshot({ path: `${out}/03-kurumsal.png`, fullPage: true });

  // İlçe sayfası: doğru Türkçe ekler ve yapılandırılmış veri
  await page.goto(base + "/hizmet-bolgeleri/besiktas");
  await page.getByRole("heading", { name: "Beşiktaş moto kurye" }).waitFor();
  await page.getByText("Beşiktaş'ta sık taşıdıklarımız").waitFor();
  await page.getByText("Anadolu yakasından Beşiktaş'a geçişlerde", { exact: false }).waitFor();
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  if (!ld.some((s) => s.includes('"BreadcrumbList"')) || !ld.some((s) => s.includes('"LocalBusiness"'))) throw new Error("JSON-LD eksik");
  await page.screenshot({ path: `${out}/04-ilce.png`, fullPage: true });

  const sm = await (await page.request.get(base + "/sitemap.xml")).text();
  if (!sm.includes("/hizmet-bolgeleri/kadikoy")) throw new Error("sitemap ilçe içermiyor");
  const rb = await (await page.request.get(base + "/robots.txt")).text();
  if (!/Sitemap: .*sitemap\.xml/.test(rb)) throw new Error("robots sitemap içermiyor");
  if ((await page.request.get(base + "/hizmet-bolgeleri/yok")).status() !== 404) throw new Error("bilinmeyen ilçe 404 olmalı");

  // SSS: FAQPage verisi
  await page.goto(base + "/sss");
  const faq = await page.locator('script[type="application/ld+json"]').allTextContents();
  if (!faq.some((s) => s.includes('"FAQPage"'))) throw new Error("FAQPage eksik");

  // Kurye başvurusu: belge seçimi ve KVKK onayı
  await page.goto(base + "/kurye-ol");
  await t("apply-name").fill("Can Kurye");
  await t("apply-phone").fill("0555 111 22 33");
  await t("apply-birth").fill("1995");
  await t("apply-doc-ehliyet_on").setInputFiles({ name: "ehliyet.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  await t("apply-submit").click();
  await page.getByText("Aydınlatma metnini onaylamanız gerekiyor").waitFor();
  await t("apply-consent").check();
  await t("apply-submit").click();
  await t("apply-done").waitFor();
  await page.screenshot({ path: `${out}/06-kurye-ol.png`, fullPage: true });

  await page.goto(base + "/api-belgeleri");
  await page.getByRole("heading", { name: "Kurumsal API" }).waitFor();
  await page.getByText("X-Webhook-Signature", { exact: false }).first().waitFor();

  // Telefon görünümü
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  watch(m);
  await m.goto(base + "/");
  await m.getByTestId("pickup-input").waitFor();
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error("telefonda yatay kaydırma var");
  await m.screenshot({ path: `${out}/05-mobil.png`, fullPage: true });

  if (errors.length) throw new Error("Tarayıcı hataları: " + JSON.stringify(errors.slice(0, 10)));
  console.log("✓ site e2e akışı geçti");
  await browser.close();
})().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});
