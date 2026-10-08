// DEMO modunda tam müşteri akışı: giriş → KVKK → adres → fiyat → sipariş → durum ilerlemesi.
// Kullanım: pnpm --filter @yazgan/mobile e2e:web  (önce export:web)
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || 'e2e/shots';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async n => page.screenshot({ path: `${out}/${n}.png`, fullPage: true });
  const tid = id => page.getByTestId(id);
  await page.goto(`http://localhost:${process.env.PORT || 8099}/`);
  await tid('phone').waitFor();
  await shot('01-giris');
  await tid('phone').fill('05321234567');
  await tid('send-otp').click();
  await tid('otp').waitFor();
  await tid('otp').fill('123456');
  await shot('02-dogrula');
  await tid('verify').click();
  await tid('kvkk-accept').waitFor();
  await shot('03-kvkk');
  await page.getByRole('checkbox').nth(0).click();
  await page.getByRole('checkbox').nth(1).click();
  await tid('kvkk-accept').click();
  await tid('address-pickup').waitFor();
  await shot('04-form-bos');
  for (const [target, q] of [['pickup','beykoz'],['dropoff','levent']]) {
    await tid(`address-${target}`).click();
    await tid('address-search').fill(q);
    await tid('suggestion-0').click();
    await tid('address-details').fill(target==='pickup'?'Kat 2':'Kanyon AVM, B Blok');
    if (target==='dropoff') await shot('05-adres');
    await tid('address-save').click();
    await tid('address-pickup').waitFor();
  }
  await page.getByText('Acil (60 dk)').click();
  await shot('06-form-dolu');
  await tid('see-price').click();
  await page.getByText('Toplam', { exact: true }).waitFor();
  await shot('07-ozet');
  const text = await page.locator('body').innerText();
  console.log('OZET:', text.match(/Fiyat[\s\S]*?Toplam\s*[\d.,]+ TL/)?.[0]?.replace(/\n+/g,' | '));
  await tid('confirm-order').click();
  await page.getByText('Siparişiniz alındı', { exact: false }).waitFor();
  await shot('08-siparis-yeni');
  await page.getByText('Kuryeniz:', { exact: false }).waitFor({ timeout: 20000 });
  await shot('09-siparis-ilerledi');
  console.log('DURUM:', (await page.locator('body').innerText()).match(/YK-\d+[\s\S]{0,40}/)?.[0]?.replace(/\n/g,' | '));
  if (errors.length) throw new Error('Tarayıcı hataları: ' + JSON.stringify(errors.slice(0, 10)));
  // Geri dönülebilmeli
  await page.goBack();
  console.log('✓ e2e akışı geçti');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
