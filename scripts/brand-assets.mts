/**
 * Brand asset generator — app icons, splash, adaptive icons, favicons, OG image and store graphics.
 *
 * Usage (from repo root):
 *   pnpm brand:assets                      # icons, splash, favicons, OG/Twitter image, Play feature graphic + icon
 *   pnpm brand:store                       # store screenshots (needs the Expo web app running in DEMO mode)
 *   node scripts/brand-assets.mts --store --url=http://localhost:8081
 *
 * When the brand name changes: update packages/shared/brand.ts → pnpm brand:assets && pnpm brand:store
 * (the icon initial, wordmark, tagline, slogan and domain are all read from BRAND).
 *
 * Requirements: Node 24+ (runs TypeScript directly), playwright (Chromium) and sharp from the root node_modules.
 * Store screenshots drive the demo flow with the same testIDs as apps/mobile/e2e/demo-flow.cjs; map tiles come
 * from OpenStreetMap when reachable, otherwise from the stub tile used by the e2e tests.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import sharp from "sharp";
import { BRAND } from "../packages/shared/brand.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { stubTiles } = require("./e2e-tile-stub.cjs") as { stubTiles: (ctx: BrowserContext) => Promise<{ count: number }> };

const args = process.argv.slice(2);
const STORE = args.includes("--store");
const APP_URL = (args.find((a) => a.startsWith("--url="))?.slice(6) ?? "http://localhost:8081").replace(/\/$/, "");

const NEO = BRAND.neo;
const NAME_UPPER = BRAND.shortName.toLocaleUpperCase("tr-TR");
const INITIAL = [...NAME_UPPER][0];
const TAGLINE_UPPER = BRAND.tagline.toLocaleUpperCase("tr-TR");
/** Short promise used on OG / feature graphic (no numbers or claims) */
const PROMISE = "Acil evrak ve paket, moto kurye ile kapıdan kapıya.";

// ───────────────────────── shared HTML building blocks

const FONT_DIR = join(ROOT, "node_modules/@fontsource-variable/archivo/files");
const fontFace = (file: string, range: string) =>
  `@font-face{font-family:"Archivo";font-weight:100 900;font-style:normal;` +
  `src:url(data:font/woff2;base64,${readFileSync(join(FONT_DIR, file)).toString("base64")}) format("woff2");unicode-range:${range};}`;
/** Archivo variable (latin + latin-ext covers Turkish İ, Ş, Ğ, ı) embedded as data URIs */
const FONTS =
  fontFace("archivo-latin-wght-normal.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212") +
  fontFace("archivo-latin-ext-wght-normal.woff2", "U+0100-0130,U+0132-02BA,U+02BD-02C5,U+1E00-1E9F,U+20A0-20AB,U+20AD-20C0");

const STICKER_DIR = join(ROOT, "apps/web/public/neo");
const sticker = (name: string) => `data:image/png;base64,${readFileSync(join(STICKER_DIR, `${name}.png`)).toString("base64")}`;

const BASE_CSS = `${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:"Archivo",system-ui,sans-serif;color:${NEO.ink};-webkit-font-smoothing:antialiased}`;

/** Lime arrow from the Wordmark (apps/web/src/components/Wordmark.tsx), same viewBox and strokes */
function arrowSvg(opts: { color: string; extra?: number; style?: string }) {
  const e = opts.extra ?? 0;
  return `<svg viewBox="0 0 40 22" overflow="visible" style="${opts.style ?? ""}" aria-hidden="true">
<path d="M2 16 L26 9" stroke="${opts.color}" stroke-width="${7 + e}" stroke-linecap="round"/>
<path d="M20 3 L34 7 L25 18" fill="none" stroke="${opts.color}" stroke-width="${6 + e}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Wordmark: short name (uppercase) + lime arrow + tagline. Proportions match Wordmark.tsx (text-4xl variant). */
function wordmarkHtml(fontPx: number, opts: { tagline?: boolean; color?: string } = {}) {
  const color = opts.color ?? NEO.ink;
  const arrow = arrowSvg({
    color: NEO.lime,
    style: `position:absolute;left:${(19 / 36).toFixed(4)}em;top:${(12 / 36).toFixed(4)}em;width:${(35 / 36).toFixed(4)}em;height:${(19 / 36).toFixed(4)}em`,
  });
  const tag = opts.tagline === false ? "" :
    `<span style="display:block;margin-top:${(4 / 36).toFixed(3)}em;font-size:${(9 / 36).toFixed(4)}em;font-weight:800;letter-spacing:.4em;white-space:nowrap">${TAGLINE_UPPER}</span>`;
  return `<span style="display:inline-block;font-size:${fontPx}px;color:${color}">
<span style="position:relative;display:block;font-weight:900;line-height:1;letter-spacing:-.045em;white-space:nowrap">${NAME_UPPER}${arrow}</span>${tag}</span>`;
}

// ───────────────────────── browser helpers

let browser: Browser | null = null;
async function getBrowser() {
  browser ??= await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  return browser;
}

/** Renders an HTML document at an exact pixel size (CSS width × dpr) and returns a PNG buffer */
async function renderHtml(html: string, cssW: number, cssH: number, opts: { dpr?: number; transparent?: boolean } = {}) {
  const b = await getBrowser();
  const page = await b.newPage({ viewport: { width: cssW, height: cssH }, deviceScaleFactor: opts.dpr ?? 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => undefined))));
  await fitText(page);
  await assertNoOverflow(page);
  const png = await page.screenshot({ omitBackground: opts.transparent ?? false, type: "png" });
  await page.close();
  return png;
}

/** Fails if any element marked data-fit overflows its box (text cut off / spilling) */
async function assertNoOverflow(page: Page) {
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-fit]")]
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .map((el) => el.dataset.fit),
  );
  if (bad.length) throw new Error(`Metin taşıyor: ${bad.join(", ")}`);
}

/**
 * Auto-fits text (after web fonts load): shrinks every [data-shrink] element until it fits its parent box,
 * down to 70% of the designed size. Keeps layouts safe when the brand name or headlines get longer;
 * anything that still does not fit fails the run instead of producing a cut-off image.
 */
async function fitText(page: Page) {
  const bad = await page.evaluate(() => {
    const failed: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[data-shrink]")) {
      const box = el.parentElement!;
      const start = parseFloat(getComputedStyle(el).fontSize);
      let size = start;
      const overflows = () => el.offsetHeight > box.clientHeight + 0.5 || el.scrollWidth > box.clientWidth + 0.5;
      while (overflows() && size > start * 0.7) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
      if (overflows()) failed.push(el.textContent?.trim().slice(0, 40) ?? "?");
    }
    return failed;
  });
  if (bad.length) throw new Error(`Metin sığmıyor (yazıyı kısaltın): ${bad.join(" | ")}`);
}

// ───────────────────────── icon mark

type GlyphStyle = "color" | "mono";
const glyphCache = new Map<GlyphStyle, Buffer>();

/**
 * The mark glyph: brand initial (Archivo 900) with the Wordmark's lime arrow crossing out of it.
 * A thin knock-out gap separates the arrow from the letter so both read at 16–48 px.
 * Returned trimmed on a transparent background, so any initial (narrow "I" or wide "M") centers correctly.
 */
async function markGlyph(style: GlyphStyle) {
  const cached = glyphCache.get(style);
  if (cached) return cached;
  const letterColor = "#FFFFFF";
  const arrowColor = style === "mono" ? "#FFFFFF" : NEO.lime;
  const b = await getBrowser();
  const page = await b.newPage({ viewport: { width: 1600, height: 1100 } });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
html,body{background:transparent}
#l{position:absolute;left:150px;top:150px;font:900 600px/1 "Archivo";color:${letterColor};white-space:nowrap}
.a{position:absolute}</style></head><body>
<div id="l">${INITIAL}</div>
<div class="a" id="o">${arrowSvg({ color: "#000", extra: 3.2, style: "width:100%;height:100%" })}</div>
<div class="a" id="r">${arrowSvg({ color: arrowColor, style: "width:100%;height:100%" })}</div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  // Arrow placement is relative to the letter's advance width, so wide and narrow initials both work
  await page.evaluate(() => {
    const l = document.getElementById("l")!;
    const adv = l.getBoundingClientRect().width;
    const em = 600;
    const w = em * 0.74;
    for (const id of ["o", "r"]) {
      const a = document.getElementById(id)!;
      Object.assign(a.style, { left: `${150 + adv * 0.36}px`, top: `${150 + em * 0.27}px`, width: `${w}px`, height: `${(w * 22) / 40}px` });
    }
  });
  const shoot = async (show: string[]) => {
    await page.evaluate((ids) => {
      for (const id of ["l", "o", "r"]) document.getElementById(id)!.style.visibility = ids.includes(id) ? "visible" : "hidden";
    }, show);
    return page.screenshot({ omitBackground: true, type: "png" });
  };
  const [letter, outline, arrow] = [await shoot(["l"]), await shoot(["o"]), await shoot(["r"])];
  await page.close();
  const merged = await sharp(letter)
    .composite([{ input: outline, blend: "dest-out" }, { input: arrow, blend: "over" }])
    .png()
    .toBuffer();
  const trimmed = await sharp(merged).trim({ threshold: 1 }).png().toBuffer();
  glyphCache.set(style, trimmed);
  return trimmed;
}

/** Fits the glyph into a box of `box` px (longest side) and centers it on a transparent canvas of `size` */
async function glyphOnCanvas(size: number, box: number, style: GlyphStyle, opts: { byDiagonal?: boolean } = {}) {
  const g = await markGlyph(style);
  const m = await sharp(g).metadata();
  // byDiagonal: the glyph's bounding box diagonal must fit `box` (Android safe circle)
  const scale = opts.byDiagonal ? box / Math.hypot(m.width!, m.height!) : box / Math.max(m.width!, m.height!);
  const w = Math.round(m.width! * scale);
  const h = Math.round(m.height! * scale);
  const resized = await sharp(g).resize(w, h).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png()
    .toBuffer();
}

const svgRect = (size: number, color: string, radius = 0) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${color}"/></svg>`);

/** Ink tile + glyph. rounded=false gives a full-bleed square (iOS / Play apply their own mask). */
async function markTile(size: number, opts: { rounded: boolean; glyphRatio?: number }) {
  const glyph = await glyphOnCanvas(size, Math.round(size * (opts.glyphRatio ?? 0.6)), "color");
  return sharp(svgRect(size, NEO.ink, opts.rounded ? size * 0.225 : 0))
    .composite([{ input: glyph }])
    .png()
    .toBuffer();
}

// ───────────────────────── file output helpers

const written: string[] = [];
function out(rel: string) {
  const abs = join(ROOT, rel);
  mkdirSync(dirname(abs), { recursive: true });
  written.push(abs);
  return abs;
}
/** Writes a PNG at an exact size; alpha=false flattens onto `flatten` and strips the alpha channel */
async function writePng(rel: string, input: Buffer, size: { w: number; h: number }, alpha: boolean, flatten: string = NEO.ink) {
  let img = sharp(input).resize(size.w, size.h, { fit: "fill", kernel: "lanczos3" });
  img = alpha ? img.ensureAlpha() : img.flatten({ background: flatten }).removeAlpha();
  await img.png({ compressionLevel: 9 }).toFile(out(rel));
}

/** Multi-resolution .ico with PNG-compressed entries (supported by all current browsers) */
async function writeIco(rel: string, source: Buffer, sizes: number[]) {
  const pngs = await Promise.all(sizes.map((s) => sharp(source).resize(s, s, { kernel: "lanczos3" }).ensureAlpha().png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(s >= 256 ? 0 : s, e);
    header.writeUInt8(s >= 256 ? 0 : s, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(pngs[i].length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  writeFileSync(out(rel), Buffer.concat([header, ...pngs]));
}

// ───────────────────────── 1–4: icons, splash, favicons, OG

async function buildCoreAssets() {
  const square1024 = await markTile(1024, { rounded: false });
  const rounded1024 = await markTile(1024, { rounded: true });

  // Mobile (Expo): iOS icon must be opaque and unrounded
  await writePng("apps/mobile/assets/icon.png", square1024, { w: 1024, h: 1024 }, false);
  // Splash: rounded mark on transparent canvas; sized to stay inside Android 12+'s circular splash mask
  const splash = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp(rounded1024).resize(520, 520).png().toBuffer(), left: 252, top: 252 }])
    .png()
    .toBuffer();
  await writePng("apps/mobile/assets/splash-icon.png", splash, { w: 1024, h: 1024 }, true);
  // Android adaptive icon: 108dp canvas, safe zone = centered 66dp circle (61% of the canvas)
  const safeDiameter = Math.round(1024 * (66 / 108) * 0.9);
  await writePng("apps/mobile/assets/android-icon-foreground.png", await glyphOnCanvas(1024, safeDiameter, "color", { byDiagonal: true }), { w: 1024, h: 1024 }, true);
  await writePng("apps/mobile/assets/android-icon-background.png", svgRect(1024, NEO.ink), { w: 1024, h: 1024 }, true);
  await writePng("apps/mobile/assets/android-icon-monochrome.png", await glyphOnCanvas(1024, safeDiameter, "mono", { byDiagonal: true }), { w: 1024, h: 1024 }, true);
  await writePng("apps/mobile/assets/favicon.png", rounded1024, { w: 48, h: 48 }, true);

  // Next.js file-based metadata (admin panel + website): favicon.ico, icon.png, apple-icon.png
  for (const app of ["apps/admin/src/app", "apps/web/src/app"]) {
    await writeIco(`${app}/favicon.ico`, rounded1024, [16, 32, 48]);
    await writePng(`${app}/icon.png`, rounded1024, { w: 512, h: 512 }, true);
    // iOS rounds home-screen icons itself: opaque full-bleed square
    await writePng(`${app}/apple-icon.png`, square1024, { w: 180, h: 180 }, false);
  }
  // The old SVG icon (motor line art) is replaced by icon.png; keeping both would emit two <link rel="icon">
  if (existsSync(join(ROOT, "apps/web/src/app/icon.svg"))) rmSync(join(ROOT, "apps/web/src/app/icon.svg"));

  // OG / Twitter card 1200×630
  const og = await renderHtml(ogHtml(), 1200, 630, { dpr: 1 });
  await writePng("apps/web/src/app/opengraph-image.png", og, { w: 1200, h: 630 }, false, NEO.bg);
  await writePng("apps/web/src/app/twitter-image.png", og, { w: 1200, h: 630 }, false, NEO.bg);
  const alt = `${BRAND.name}: ${PROMISE}`;
  writeFileSync(out("apps/web/src/app/opengraph-image.alt.txt"), alt);
  writeFileSync(out("apps/web/src/app/twitter-image.alt.txt"), alt);

  // Google Play: 512×512 32-bit icon (Play applies its own mask) + 1024×500 feature graphic
  await writePng("store/android/play-icon-512.png", square1024, { w: 512, h: 512 }, true);
  const feature = await renderHtml(featureHtml(), 1024, 500, { dpr: 1 });
  await writePng("store/android/feature-graphic-1024x500.png", feature, { w: 1024, h: 500 }, false, NEO.bg);
}

/** Small pill like the site's hero badge: ink background, lime dot, spaced uppercase text */
const pill = (text: string, px: number) =>
  `<span style="display:inline-flex;align-items:center;gap:.7em;background:${NEO.ink};color:#fff;border-radius:999px;padding:.75em 1.3em;font-size:${px}px;font-weight:800;letter-spacing:.18em;white-space:nowrap">
<span style="width:.7em;height:.7em;border-radius:50%;background:${NEO.lime}"></span>${text}</span>`;

function ogHtml() {
  return `<div style="position:relative;width:1200px;height:630px;background:${NEO.bg};overflow:hidden">
  <div style="position:absolute;right:-120px;top:-140px;width:640px;height:640px;border-radius:50%;background:#DCD2FB"></div>
  <img src="${sticker("motor")}" style="position:absolute;right:46px;top:150px;width:420px;transform:rotate(-4deg)">
  <img src="${sticker("zarf")}" style="position:absolute;right:400px;top:52px;width:150px;transform:rotate(-12deg)">
  <div style="position:absolute;left:72px;top:64px;width:640px">${wordmarkHtml(76)}</div>
  <div data-fit="og-headline" style="position:absolute;left:72px;top:232px;width:640px;height:250px;overflow:hidden">
    <div data-shrink style="font-size:62px;font-weight:900;line-height:1.02;letter-spacing:-.035em">${PROMISE}</div>
  </div>
  <div data-fit="og-slogan" style="position:absolute;left:72px;top:500px;width:640px;height:34px;overflow:hidden">
    <div data-shrink style="font-size:24px;font-weight:600;color:${NEO.mutedDark};white-space:nowrap">${BRAND.slogan}</div>
  </div>
  <div style="position:absolute;left:72px;bottom:28px">${pill(BRAND.domain.toLocaleUpperCase("tr-TR"), 15)}</div>
</div>`;
}

function featureHtml() {
  // Logo and text stay in the centered safe area; stickers are decorative at the edges
  return `<div style="position:relative;width:1024px;height:500px;background:${NEO.bg};overflow:hidden">
  <div style="position:absolute;left:-90px;bottom:-150px;width:420px;height:420px;border-radius:50%;background:#DCD2FB"></div>
  <div style="position:absolute;right:-110px;top:-130px;width:440px;height:440px;border-radius:50%;background:#DCD2FB"></div>
  <img src="${sticker("zarf")}" style="position:absolute;left:34px;top:46px;width:150px;transform:rotate(-10deg)">
  <img src="${sticker("pin")}" style="position:absolute;left:62px;bottom:46px;width:118px;transform:rotate(8deg)">
  <img src="${sticker("motor")}" style="position:absolute;right:18px;top:150px;width:220px;transform:rotate(-4deg)">
  <div style="position:absolute;left:242px;right:242px;top:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;text-align:center">
    <div data-fit="fg-wordmark" style="width:540px;height:130px;display:flex;align-items:center;justify-content:center;overflow:hidden">${wordmarkHtml(80)}</div>
    <div data-fit="fg-promise" style="width:540px;height:90px;overflow:hidden">
      <div data-shrink style="font-size:33px;font-weight:900;line-height:1.08;letter-spacing:-.03em">${PROMISE}</div>
    </div>
  </div>
</div>`;
}

// ───────────────────────── 5: store screenshots

type Shot = { id: string; title: string; sub: string; sticker: string; file: string };

const SHOTS: Shot[] = [
  { id: "01-siparis", title: "Adresi yaz, kurye gelsin.", sub: "Alış ve teslim adresini seç; ekonomi, standart ya da acil.", sticker: "zarf", file: "form" },
  { id: "02-fiyat", title: "Fiyatı önceden gör.", sub: "Siparişi vermeden önce kalem kalem toplam.", sticker: "fis", file: "ozet" },
  { id: "03-takip", title: "Kuryeni canlı izle.", sub: "Haritada kurye konumu ve tahmini teslim saati.", sticker: "pin", file: "takip" },
  { id: "04-degerlendirme", title: "Teslim edildi, puanla.", sub: "Teslimat bitince tek dokunuşla değerlendir.", sticker: "yildiz", file: "degerlendirme" },
  { id: "05-kurye-teklif", title: "Kurye uygulaması dahil.", sub: "İş teklifini gör, kabul et, durak sırasını izle.", sticker: "kask", file: "kurye-teklif" },
  { id: "06-kurye-teslim", title: "Fotoğraf + imza ile teslim.", sub: "Teslim alan kişi, imza ve teslim kodu kayıt altında.", sticker: "imza", file: "kurye-teslim" },
];

const STORE_SIZES = [
  { dir: "store/ios-6.9", w: 1320, h: 2868, alpha: false },
  { dir: "store/ios-6.5", w: 1284, h: 2778, alpha: false },
  { dir: "store/android", w: 1080, h: 1920, alpha: false },
];

/**
 * Captured phone screen: 430×932 pt device at 3× (iPhone Pro Max class). The top `inset` is left empty in the
 * frame (app background colour, no fake status bar), so the app is captured `h - inset` tall.
 */
const PHONE = { w: 430, h: 932, dpr: 3, inset: 30 };
/** Store screenshots show a daytime weekday (no night/Sunday surcharge lines, realistic clock times) */
const STORE_CLOCK = new Date("2026-10-13T10:30:00+03:00");

/** Map tiles: real OSM tiles when reachable, otherwise the e2e stub tile */
async function routeTiles(ctx: BrowserContext) {
  let online = true;
  try {
    const res = await fetch("https://tile.openstreetmap.org/12/2394/1532.png", {
      headers: { "User-Agent": `${BRAND.name} brand-assets` },
      signal: AbortSignal.timeout(6000),
    });
    online = res.ok;
  } catch {
    online = false;
  }
  if (!online) {
    await stubTiles(ctx);
    console.log("  harita: OSM'e ulaşılamadı, sahte karo kullanılıyor");
  } else console.log("  harita: gerçek OSM karoları");
}

async function newPhone(b: Browser, geo?: { latitude: number; longitude: number }) {
  const ctx = await b.newContext({
    viewport: { width: PHONE.w, height: PHONE.h - PHONE.inset },
    deviceScaleFactor: PHONE.dpr,
    isMobile: false,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    ...(geo ? { permissions: ["geolocation"], geolocation: geo } : {}),
  });
  await routeTiles(ctx);
  // Fixed start time; the clock keeps running so the demo order still progresses
  await ctx.clock.install({ time: STORE_CLOCK });
  const page = await ctx.newPage();
  return { ctx, page, tid: (id: string) => page.getByTestId(id) };
}

/** Scrolls the window and every inner scroll view (react-native-web ScrollView) back to the top */
async function scrollAllToTop(page: Page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll<HTMLElement>("*")) if (el.scrollTop > 0) el.scrollTop = 0;
  });
}

/** Viewport-only screenshot after images and fonts settle, with scrollbars hidden */
async function snap(page: Page, dir: string, name: string) {
  await page.addStyleTag({ content: "*::-webkit-scrollbar{display:none!important}*{scrollbar-width:none!important}" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  const file = join(dir, `${name}.png`);
  await page.screenshot({ path: file, type: "png" });
  return file;
}

async function login(page: Page, tid: (id: string) => ReturnType<Page["getByTestId"]>, phone: string) {
  // The dev server may still be bundling on the first request
  await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await tid("phone").waitFor({ timeout: 180000 });
  await tid("phone").fill(phone);
  await tid("send-otp").click();
  await tid("otp").waitFor();
  await tid("otp").fill("123456");
  await tid("verify").click();
  await tid("kvkk-accept").waitFor();
  await page.getByRole("checkbox").nth(0).click();
  await page.getByRole("checkbox").nth(1).click();
  await tid("kvkk-accept").click();
}

/** Drives the DEMO app (same testIDs as apps/mobile/e2e/demo-flow.cjs) and saves raw phone screenshots */
async function captureScreens(dir: string) {
  const b = await getBrowser();
  const shots: Record<string, string> = {};

  // ── Customer
  {
    const { ctx, page, tid } = await newPhone(b);
    await login(page, tid, "05321234567");
    await tid("address-pickup").waitFor();
    for (const [target, q, details] of [["pickup", "beykoz", "Kat 2"], ["dropoff", "levent", "Kanyon AVM, B Blok"]] as const) {
      await tid(`address-${target}`).click();
      await tid("address-search").fill(q);
      await tid("suggestion-0").click();
      await tid("address-details").fill(details);
      await tid("tile-map").waitFor();
      await tid("address-save").click();
      await tid("address-pickup").waitFor();
    }
    await tid("level-acil").click();
    await scrollAllToTop(page);
    shots.form = await snap(page, dir, "form");

    await tid("see-price").click();
    await page.getByText("Toplam", { exact: true }).waitFor();
    shots.ozet = await snap(page, dir, "ozet");

    await page.getByText("Kartla online ödeme").click();
    await tid("confirm-order").click();
    await page.getByText("Kuryeniz:", { exact: false }).waitFor({ timeout: 30000 });
    await tid("marker-courier").waitFor();
    await tid("eta").waitFor();
    await page.waitForTimeout(2500); // let tiles finish loading
    shots.takip = await snap(page, dir, "takip");

    await page.goBack();
    await tid("address-pickup").waitFor();
    await page.getByText("Siparişlerim").first().click();
    await page.getByText(/^YK-\d+/).first().click();
    await page.getByText("Teslimatı nasıl buldunuz?").waitFor({ timeout: 60000 });
    await tid("star-5").click();
    await tid("star-5").scrollIntoViewIfNeeded();
    shots.degerlendirme = await snap(page, dir, "degerlendirme");
    await ctx.close();
  }

  // ── Courier
  {
    const { ctx, page, tid } = await newPhone(b, { latitude: 41.1295, longitude: 29.1135 });
    await login(page, tid, "0555 000 00 00");
    await page.getByText("Vardiya kapalı").waitFor();
    await tid("shift-toggle").click();
    await page.getByText("Vardiyadasınız").waitFor();
    await page.locator('[data-testid^="offer-YK"]').nth(1).waitFor();
    await scrollAllToTop(page);
    shots["kurye-teklif"] = await snap(page, dir, "kurye-teklif");

    await tid("offer-accept").first().click();
    await page.getByText(/Aktif işler \(2\)/).waitFor();
    await page.locator('[data-testid^="job-"]').first().click();
    await tid("arrive-pickup").click();
    await page.getByText(/Alış adresine vardınız/).waitFor();
    await tid("pickup").click();
    await tid("on-the-way").click();
    await tid("arrive-dropoff").click();
    await page.getByText(/Teslim adresine vardınız/).waitFor();
    await tid("deliver").click();
    await tid("receiver").fill("Resepsiyon - Zeynep Kaya");
    // A hand-written looking signature: cursive loops (trochoid) with a decaying height, then an underline flourish
    const pad = (await tid("signature-pad").boundingBox())!;
    const x0 = pad.x + pad.width * 0.12;
    const y0 = pad.y + pad.height * 0.5;
    const len = pad.width * 0.62;
    const turns = 5;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let t = 0; t <= 1.0001; t += 0.008) {
      const a = t * Math.PI * 2 * turns;
      const h = pad.height * (0.24 - 0.12 * t);
      await page.mouse.move(x0 + t * len - Math.sin(a) * 15, y0 - Math.sin(a + Math.PI / 2) * h * 0.5 + h * 0.5 - t * 18);
    }
    await page.mouse.up();
    await page.mouse.move(x0 - 6, y0 + pad.height * 0.3);
    await page.mouse.down();
    for (let t = 0; t <= 1.0001; t += 0.05) {
      await page.mouse.move(x0 - 6 + t * (len + 40), y0 + pad.height * 0.3 - t * 26 - Math.sin(t * Math.PI) * 8);
    }
    await page.mouse.up();
    await scrollAllToTop(page);
    shots["kurye-teslim"] = await snap(page, dir, "kurye-teslim");
    await ctx.close();
  }
  return shots;
}

/** Marketing frame: headline + subline on top, the real screenshot inside a rounded phone frame below */
function frameHtml(s: Shot, screenshot: string, cssW: number, cssH: number) {
  const pad = 30;
  const bezel = 11;
  const shot = `data:image/png;base64,${readFileSync(screenshot).toString("base64")}`;
  return `<div style="position:relative;width:${cssW}px;height:${cssH}px;background:${NEO.bg};overflow:hidden;display:flex;flex-direction:column;padding:${pad + 12}px ${pad}px 0">
  <div style="position:absolute;left:-90px;bottom:-60px;width:360px;height:360px;border-radius:50%;background:#DCD2FB"></div>
  <div style="position:absolute;right:-120px;top:${Math.round(cssH * 0.3)}px;width:300px;height:300px;border-radius:50%;background:#DCD2FB"></div>
  <div data-fit="headline" style="position:relative;height:96px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end">
    <div data-shrink style="font-size:44px;font-weight:900;line-height:1.04;letter-spacing:-.04em">${s.title}</div>
  </div>
  <div data-fit="sub" style="position:relative;margin-top:10px;height:44px;overflow:hidden">
    <div data-shrink style="font-size:16px;font-weight:600;line-height:1.35;color:${NEO.mutedDark}">${s.sub}</div>
  </div>
  <div style="position:relative;flex:1;min-height:0;display:flex;justify-content:center;padding:26px 0 ${pad}px">
    <div style="position:relative;height:100%;aspect-ratio:${PHONE.w + bezel * 2}/${PHONE.h + bezel * 2};max-width:100%;background:${NEO.ink};border-radius:48px;padding:${bezel}px;box-shadow:0 24px 50px -18px rgba(17,17,20,.45)">
      <div style="width:100%;height:100%;border-radius:37px;overflow:hidden;background:${NEO.bg};display:flex;flex-direction:column">
        <div style="flex:${PHONE.inset} 0 0"></div>
        <img src="${shot}" style="display:block;width:100%;flex:${PHONE.h - PHONE.inset} 0 0;min-height:0;object-fit:cover;object-position:top">
      </div>
      <img src="${sticker(s.sticker)}" style="position:absolute;right:-34px;top:-40px;width:96px;transform:rotate(10deg)">
    </div>
  </div>
</div>`;
}

async function buildStoreScreenshots() {
  const raw = join(tmpdir(), `brand-store-${Date.now()}`);
  mkdirSync(raw, { recursive: true });
  console.log(`Ekran görüntüleri alınıyor: ${APP_URL} (DEMO modu)`);
  const shots = await captureScreens(raw);
  const cssW = 440;
  for (const size of STORE_SIZES) {
    const cssH = Math.round((size.h * cssW) / size.w);
    for (const s of SHOTS) {
      const png = await renderHtml(frameHtml(s, shots[s.file], cssW, cssH), cssW, cssH, { dpr: size.w / cssW });
      await writePng(`${size.dir}/${s.id}.png`, png, { w: size.w, h: size.h }, size.alpha, NEO.bg);
    }
  }
  rmSync(raw, { recursive: true, force: true });
}

// ───────────────────────── main

try {
  if (STORE) await buildStoreScreenshots();
  else await buildCoreAssets();
} finally {
  await browser?.close();
}

// Size / alpha report so CI logs and reviewers can verify exact store requirements
for (const f of written) {
  if (!f.endsWith(".png")) {
    console.log(`  ${relative(ROOT, f).replaceAll("\\", "/")}`);
    continue;
  }
  const m = await sharp(f).metadata();
  console.log(`  ${relative(ROOT, f).replaceAll("\\", "/")}  ${m.width}×${m.height}  ${m.hasAlpha ? "alfa" : "opak"}`);
}
