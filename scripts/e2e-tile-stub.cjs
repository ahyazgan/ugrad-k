// E2E testlerinde harita karolarını ağa çıkmadan sahte PNG ile karşılar
// (test ortamı OSM'e erişemeyebilir; ayrıca OSM'i testlerle yormamak gerekir).
const zlib = require("zlib");

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** 256×256 açık zemin, ince ızgara ve bir "cadde" çizgisi */
function tilePng() {
  const S = 256;
  const raw = Buffer.alloc((S * 3 + 1) * S);
  for (let y = 0; y < S; y++) {
    raw[y * (S * 3 + 1)] = 0;
    for (let x = 0; x < S; x++) {
      const road = Math.abs(x - y) < 3 || Math.abs(x + y - S) < 2;
      const grid = x % 64 === 0 || y % 64 === 0;
      const [r, g, b] = road ? [255, 255, 255] : grid ? [214, 220, 206] : [236, 238, 228];
      const i = y * (S * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PNG = tilePng();

/** Playwright bağlamındaki karo isteklerini sahte PNG ile yanıtlar; istek sayısını döndürür */
async function stubTiles(context) {
  const counter = { count: 0 };
  await context.route(/tile\.openstreetmap\.org|\{z\}/, (route) => {
    counter.count++;
    return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });
  return counter;
}

module.exports = { stubTiles };
