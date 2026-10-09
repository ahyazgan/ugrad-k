import Image from "next/image";

/** public/neo/<ad>.png — saydam 3B çıkartmalar (mobil uygulamayla aynı dosyalar). Boyutlar: piksel genişlik × yükseklik. */
const STICKERS = {
  motor: [335, 325],
  kask: [307, 307],
  pin: [249, 317],
  telefon: [279, 326],
  ev: [320, 300],
  bina: [255, 306],
  kamera: [325, 280],
  imza: [324, 301],
  fis: [285, 322],
  hediye: [304, 320],
  kart: [348, 285],
  yildiz: [301, 302],
  zarf: [222, 201],
  kutu: [327, 273],
  simsek: [157, 226],
  kronometre: [112, 141],
  donus: [129, 172],
  // Hizmet çıkartmaları (yalnız sitede; docs/gorsel-istemleri.md §1)
  evrak: [363, 400],
  adliye: [400, 369],
  "imza-donus": [400, 400],
  takvim: [400, 352],
  numune: [400, 391],
  canta: [400, 381],
} as const;

export type StickerName = keyof typeof STICKERS;

/**
 * Süs amaçlı 3B çıkartma: boş alt metin + aria-hidden (ekran okuyucular atlar), tıklamaları geçirir.
 * Görünen boyut `className` ile verilir (ör. `w-24 h-auto`); width/height yalnız en-boy oranı ve yer ayırma içindir.
 */
export function Sticker({ name, className = "", priority }: { name: StickerName; className?: string; priority?: boolean }) {
  const [width, height] = STICKERS[name];
  return (
    <Image
      src={`/neo/${name}.png`}
      width={width}
      height={height}
      alt=""
      aria-hidden="true"
      draggable={false}
      priority={priority}
      className={`pointer-events-none h-auto select-none ${className}`}
    />
  );
}
