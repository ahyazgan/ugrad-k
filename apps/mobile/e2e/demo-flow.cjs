// DEMO modunda tam müşteri akışı: giriş → KVKK → adres → fiyat → sipariş → durum ilerlemesi.
// Kullanım: pnpm --filter @yazgan/mobile e2e:web  (önce export:web)
const { chromium } = require('playwright');
const fs = require('fs');
const { stubTiles } = require('../../../scripts/e2e-tile-stub.cjs');
const out = process.argv[2] || 'e2e/shots';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const tiles = await stubTiles(page.context());
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
  await tid('level-acil').click();
  await tid('declared-value').fill('25.000');
  await page.getByText('Teslim kodu ile teslim').click();
  await shot('06-form-dolu');
  await tid('see-price').click();
  await page.getByText('Toplam', { exact: true }).waitFor();
  await page.getByText(/Değer beyanı sigortası/).waitFor();
  // Kampanya kodu: bilinmeyen kod hata, geçerli kod indirim satırı
  await tid('promo-code').fill('YOKKOD');
  await tid('apply-promo').click();
  await page.getByText('Kod bulunamadı').waitFor();
  await tid('promo-code').fill('hosgeldin');
  await tid('apply-promo').click();
  await page.getByText('Kampanya HOSGELDIN (%20)').waitFor();
  await shot('07-ozet');
  const text = await page.locator('body').innerText();
  console.log('OZET:', text.match(/Fiyat[\s\S]*?Toplam\s*[\d.,]+ TL/)?.[0]?.replace(/\n+/g,' | '));
  await page.getByText('Kartla online ödeme').click();
  await tid('confirm-order').click();
  await page.getByText('Siparişiniz alındı', { exact: false }).waitFor();
  await page.getByText('Ödendi (kart)').waitFor();
  await shot('08-siparis-yeni');
  await page.getByText('Kuryeniz:', { exact: false }).waitFor({ timeout: 20000 });
  await tid('delivery-code').waitFor();
  // Tahmini teslim ve acil taahhüdü
  await tid('eta').waitFor();
  await page.getByText(/Acil teslim taahhüdü: \d{2}:\d{2}/).waitFor();
  // Canlı harita: kurye işareti ve konum yaşı görünür, karolar yüklenir
  await tid('marker-courier').waitFor();
  await page.getByText(/Kurye konumu · az önce/).waitFor();
  if (!tiles.count) throw new Error('harita karoları istenmedi');
  await shot('09-siparis-ilerledi');
  console.log('DURUM:', (await page.locator('body').innerText()).match(/YK-\d+[\s\S]{0,40}/)?.[0]?.replace(/\n/g,' | '));
  if (errors.length) throw new Error('Tarayıcı hataları: ' + JSON.stringify(errors.slice(0, 10)));
  // Geri tuşu müşteri sekmelerine dönmeli (giriş ekranına değil)
  await page.goBack();
  await tid('address-pickup').waitFor();
  // Hesap silme: devam eden sipariş varken engellenir
  await page.getByText('Hesabım').click();
  await page.getByText('Davet kodunuz: DEMO23').waitFor();
  await tid('delete-account').click();
  await tid('delete-account-confirm').click();
  await page.getByText('Devam eden siparişiniz varken hesap silinemez').waitFor();
  // Teslimden sonra değerlendirme (Siparişlerim → sipariş)
  await page.getByText('Siparişlerim').first().click();
  await page.getByText(/^YK-\d+/).first().click();
  await page.getByText('Teslimatı nasıl buldunuz?').waitFor({ timeout: 40000 });
  await tid('star-4').click();
  await tid('rating-submit').click();
  await tid('rating-thanks').waitFor();
  await shot('09b-degerlendirme');
  console.log('✓ müşteri akışı geçti');

  // ───────── Kurye akışı
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['geolocation'],
    geolocation: { latitude: 41.1295, longitude: 29.1135 },
  });
  await stubTiles(ctx);
  const kp = await ctx.newPage();
  kp.on('pageerror', e => errors.push(e.message));
  kp.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const kt = id => kp.getByTestId(id);
  const kshot = async n => kp.screenshot({ path: `${out}/${n}.png`, fullPage: true });
  await kp.goto(`http://localhost:${process.env.PORT || 8099}/`);
  await kt('phone').fill('0555 000 00 00');
  await kt('send-otp').click();
  await kt('otp').fill('123456');
  await kt('verify').click();
  await kp.getByText('Konum bilgilendirmesi').waitFor();
  await kp.getByRole('checkbox').nth(0).click();
  await kp.getByRole('checkbox').nth(1).click();
  await kt('kvkk-accept').click();
  await kp.getByText('Vardiya kapalı').waitFor();
  // Sigorta 10 gün içinde bitiyor: uyarı görünür ama vardiya engellenmez
  await kt('doc-warning').waitFor();
  await kp.getByText(/Zorunlu trafik sigortası: 10 gün kaldı/).waitFor();
  await kt('shift-toggle').click();
  await kp.getByText('Vardiyadasınız').waitFor();
  // İş teklifleri: geri sayım, kabul ve nedenle ret
  await kp.locator('[data-testid^="offer-YK"]').nth(1).waitFor();
  await kp.getByText(/Aktif işler \(1\)/).waitFor();
  const countdown = await kt('offer-countdown').first().innerText();
  if (!/^[12]:\d\d$/.test(countdown)) throw new Error('geri sayım yok: ' + countdown);
  await kshot('09-kurye-teklif');
  await kt('offer-accept').first().click();
  await kp.getByText(/Aktif işler \(2\)/).waitFor();
  await kt('offer-decline').click();
  await kt('decline-reason-Çok uzak').click();
  await kp.locator('[data-testid^="offer-YK"]').waitFor({ state: 'detached' });
  // Mola: molada yeni teklif gelmez, moladan dönülür
  await kt('break-toggle').click();
  await kp.getByText('Moladasınız').waitFor();
  await kt('break-info').getByText(/0 dk · molada yeni iş teklifi gelmez/).waitFor();
  await kp.getByText(/Elinizdeki 2 iş devam ediyor/).waitFor();
  await kshot('09b-kurye-mola');
  await kt('break-toggle').click();
  await kp.getByText('Vardiyadasınız').waitFor();
  await kp.getByText(/Aktif işler \(2\)/).waitFor();
  await kshot('10-kurye-isler');
  await kp.locator('[data-testid^="job-"]').first().click();
  await kt('tile-map').waitFor();
  await kt('marker-pickup').waitFor();
  await kt('marker-dropoff').waitFor();
  // Varış: "Vardım" sonrası bekleme otomatik ölçülür, elle giriş kalkar
  await kt('waiting').waitFor();
  await kt('arrive-pickup').click();
  await kp.getByText(/Alış adresine vardınız/).waitFor();
  await kt('waiting-measured').getByText('Bekleme: 0 dk').waitFor();
  if (await kt('waiting').count()) throw new Error('varıştan sonra elle bekleme girişi kalmamalı');
  await kshot('11-kurye-is');
  await kt('pickup').click();
  await kt('on-the-way').waitFor();
  await kt('on-the-way').click();
  await kt('arrive-dropoff').click();
  await kp.getByText(/Teslim adresine vardınız/).waitFor();
  await kt('deliver').click();
  await kt('receiver').fill('Resepsiyon - Zeynep');
  const pad = await kt('signature-pad').boundingBox();
  await kp.mouse.move(pad.x + 30, pad.y + 100);
  await kp.mouse.down();
  for (let i = 1; i <= 12; i++) await kp.mouse.move(pad.x + 30 + i * 20, pad.y + 100 + (i % 2 ? -30 : 30), { steps: 3 });
  await kp.mouse.up();
  // Teslim kodu: yanlış kod hak düşer, doğru kodla açılır
  await kt('delivery-code-input').fill('0000');
  await kt('verify-code').click();
  await kp.getByText('Kod yanlış, 4 hakkınız kaldı').waitFor();
  await kt('delivery-code-input').fill('4821');
  await kt('verify-code').click();
  await kp.getByText('Kod doğru').waitFor();
  // Kuryeye ödemeli sipariş: tahsilat seçilmeden teslim tamamlanamaz
  await kp.getByText(/^Tahsilat: [\d.,]+ TL$/).waitFor();
  if (await kt('complete-delivery').isEnabled()) throw new Error('tahsilat seçilmeden teslim açık');
  await kt('cash-nakit').click();
  await kshot('12-kurye-teslim');
  await kt('complete-delivery').click();
  await kp.getByText(/Bugün teslim edilen \(1\)/).waitFor();
  await kp.getByText(/Aktif işler \(1\)/).waitFor();
  // Kazancım: teslimat ve elde tutulan nakit
  await kp.getByRole('tab', { name: /Kazancım/ }).click();
  await kt('earnings-net').waitFor();
  const earn = await kp.locator('body').innerText();
  if (!/Elinizdeki nakit tahsilat/.test(earn) || !/YK-\d+/.test(earn)) throw new Error('kazanç ekranı eksik');
  console.log('KAZANC:', earn.match(/Hesaplaşılmamış kazanç[\s\S]{0,160}/)?.[0]?.replace(/\n+/g, ' | '));
  await kshot('12b-kurye-kazanc');
  await kp.getByRole('tab', { name: /Hesabım/ }).click();
  await kp.getByText('Belgelerim').waitFor();
  await kp.getByText(/Süresi yaklaşıyor ·/).waitFor();
  await kp.getByRole('tab', { name: /İşlerim/ }).click();
  // Acil durum: tür seç, bildir; yönetici görünce onay; kurye molaya alınır
  await kt('sos-open').click();
  await kt('call-112').waitFor();
  if (await kt('sos-send').isEnabled()) throw new Error('tür seçilmeden SOS gönderilebiliyor');
  await kt('sos-kind-arac_ariza').click();
  await kt('sos-send').click();
  await kt('sos-status').getByText(/Araç arızası/).waitFor();
  await kt('sos-acknowledged').waitFor({ timeout: 15000 });
  await kshot('12c-kurye-sos');
  await kp.goBack();
  await kp.getByText('Moladasınız').waitFor();
  await kt('break-toggle').click();
  await kp.getByText('Vardiyadasınız').waitFor();
  // Elde paket yokken vardiya kapatılabilir
  await kt('shift-toggle').click();
  await kp.getByText('Vardiya kapalı').waitFor();
  await kshot('13-kurye-bitti');
  if (errors.length) throw new Error('Tarayıcı hataları: ' + JSON.stringify(errors.slice(0, 10)));
  console.log('✓ kurye akışı geçti');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
