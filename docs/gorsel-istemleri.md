# Görsel istemleri (ChatGPT / görsel üretici)

Sitede, mobil uygulamada ve panelde ikon veya yer tutucu duran yerler için üretilecek görseller ve
ChatGPT'ye yapıştırılacak istemler. Mevcut 3B çıkartmalarla (`apps/web/public/neo/*.png`) aynı dilde olmalılar.

## Nasıl üretilir

1. ChatGPT'de **yeni bir sohbet** aç. Stil tutarlı kalsın diye tüm görselleri aynı sohbette üret.
2. Referans olarak şu 3 dosyayı sohbete yükle: `apps/web/public/neo/motor.png`, `pin.png`, `zarf.png`.
3. Önce aşağıdaki **"Stil kilidi"** metnini yapıştır, sonra her görselin istemini **tek tek** gönder.
4. Her görseli **saydam arka planlı PNG** olarak indir ve tablodaki **dosya adıyla** kaydet
   (ör. `Masaüstü\yeni-gorseller\adliye.png`).
5. Bitince Claude'a "yeni görseller şu klasörde" de: kırpma, boyutlandırma (en fazla 400 px), sıkıştırma ve
   site/mobil/panele yerleştirme otomatik yapılır.

**Kurallar:** Görselde **yazı, logo, marka adı ve rakam olmasın** (marka adı değişebilir; kutu çıkartmasındaki
"YAZGAN" yazısı bu yüzden sorun). İnsan yüzü olmasın. Gerçek bir yer/kurumun tabelası olmasın.
Hepsi aynı açıdan (hafif 3/4 üstten) bakan, **döndürülmemiş** nesneler olsun; eğimi gerekirse kod verir.

### Stil kilidi (ilk mesaj)

```
I will ask you for a series of 3D sticker illustrations for a courier brand. Every image must follow this exact style,
matching the reference images I uploaded:

- A single object, glossy 3D render, soft inflated rounded shapes.
- Iridescent holographic chrome material: pastel lilac, pink, mint and sky-blue reflections.
- Accent parts in flat lime green (#D6FB45), used sparingly (a strap, a button, a band).
- Small dark ink details (#111114) only where needed for readability.
- Thick white die-cut sticker outline around the whole object, with a very soft grey drop shadow.
- Three-quarter view from slightly above, object upright (not rotated), centered, filling ~80% of the canvas.
- Fully transparent background, square 1024x1024 PNG.
- Absolutely no text, letters, numbers, logos or brand names anywhere. No people, no faces.
Reply "OK" and wait for my first object.
```

## 1. "Ne taşıyoruz" kartları (ana sayfa) — öncelikli

Ekran alıntısındaki 6 kart. Şu an çizgi ikon var (`apps/web/src/components/ServiceIcon.tsx`); görseller gelince
kartlarda 64 px, eşit boyut ve açıyla gösterilecek.

| Kart | Dosya adı | İstem |
|---|---|---|
| Acil evrak | `evrak.png` | `Object: a thick document folder with a few contract pages peeking out and a lime green paper clip, a small lime lightning bolt badge on the corner to suggest urgency.` |
| Adliye ve resmi kurum | `adliye.png` | `Object: a small classical courthouse building with columns and a triangular pediment, a lime green flag or band on the roof. No text or emblem on the building.` |
| Gidiş-dönüş imza | `imza-donus.png` | `Object: a signed document sheet with a fountain pen, and two curved arrows looping around it (one going, one returning), arrows in lime green.` |
| Planlı gönderi | `takvim.png` | `Object: a desk calendar block with blank day squares (no numbers), one square highlighted in lime green, with a small alarm clock leaning against it.` |
| Numune ve küçük paket | `numune.png` | `Object: a small padded parcel next to a sealed sample vial and a small spare-part gear, grouped together as one sticker. Lime green tape on the parcel.` |
| Kurumsal hesap | `canta.png` | `Object: a sleek business briefcase with a lime green handle strap and a small stack of invoices clipped to its side.` |

## 2. Eksik çıkartmalar (sayfa içleri ve uygulama)

| Kullanılacağı yer | Dosya adı | İstem |
|---|---|---|
| Kutu çıkartmasının yerine (her yerde): yazısız ve lekesiz | `kutu.png` | `Object: a cardboard-like delivery box with lime green packing tape across the top and a small "this side up" double-arrow pictogram. No text, no logo.` |
| Köprü ücreti kartları (fiyatlar, hizmet bölgeleri, adres ekranı ipucu) | `kopru.png` | `Object: a stylized suspension bridge segment with two towers and cables, lime green cables, small water wave underneath.` |
| Taahhüt şeridi "Gizli ücret yok" | `kalkan.png` | `Object: a rounded shield with a lime green check mark in the middle.` |
| Değer beyanı / sigorta, KVKK ekranı | `kilit.png` | `Object: a rounded padlock with a lime green shackle, slightly open-looking but secure.` |
| Kurye ol: "Başvuru formu" adımı, kurumsal "Başvuru" adımı | `pano.png` | `Object: a clipboard with a blank form (lines only, no text) and a lime green pen clipped on top.` |
| Kurye ol: "Görüşme", kurumsal "Sizi arıyoruz" | `sohbet.png` | `Object: two overlapping speech bubbles, the front one lime green with three dots.` |
| Kurye ol: "Belge kontrolü" | `belge.png` | `Object: a driver licence style ID card (blank, no photo, no text) with a lime green check badge on its corner.` |
| Kazancım (mobil), hakediş boş durumu (panel) | `cuzdan.png` | `Object: a soft wallet with two coins and a folded banknote sticking out, lime green clasp. No currency symbols or numbers.` |
| Vardiyam (mobil), vardiya planı (panel) | `vardiya.png` | `Object: a round wall clock with a lime green clock hand, next to a small calendar page (blank).` |
| Mesajlar boş durumu (mobil) | `mesaj.png` | `Object: a smartphone lying slightly tilted with a lime green chat bubble popping out of the screen.` |
| Canlı takip / harita boş durumu (panel) | `harita.png` | `Object: a folded paper map with a route line in lime green and a small location pin on it.` |
| Kurumsal sayfa: "Ekip davet" adımı | `ekip.png` | `Object: three simple rounded person-shaped tokens (no faces, abstract pawns) standing together, the front one lime green.` |

## 3. Sahne görselleri (yer tutucu olan alanlar)

Bunlar çıkartma değil, küçük sahne illüstrasyonu; yine aynı malzeme ve renk dili.

| Kullanılacağı yer | Dosya adı | Boyut | İstem |
|---|---|---|---|
| Ana sayfa "Teslim kanıtı" fiş maketindeki fotoğraf alanı (şu an "teslim fotoğrafı" yazan boş kutu) | `teslim-sahne.png` | 1200x900, opak lila zemin (#ECE6FD) | `A 3D illustration in the same holographic sticker style but as a small scene: a gloved courier hand (only hand and sleeve, no face) handing a document envelope over a reception desk to another hand. Soft lilac background (#ECE6FD), no text, no logos, landscape 4:3.` |
| Hizmet bölgeleri sayfası (şematik haritanın üstü) | `istanbul.png` | 1600x900, saydam | `A playful 3D diorama of Istanbul's two shores split by a blue strait, connected by a suspension bridge with lime green cables, small rounded hills and generic buildings on both sides, a tiny courier scooter crossing the bridge. No landmarks with text, no flags. Transparent background, wide 16:9.` |
| Kurye ol sayfası başlığı | `kurye-sahne.png` | 1200x1200, saydam | `A 3D scene: a delivery scooter (same holographic style as the reference) with a lime green top box, a helmet resting on the seat and a smartphone mounted on the handlebar. No rider, no text.` |
| Kurumsal sayfa başlığı | `kurumsal-sahne.png` | 1200x1200, saydam | `A 3D scene: a small office building next to a stack of documents and a briefcase, a lime green delivery box in front. No text, no logos.` |

## Sonradan yapılacaklar (Claude)

- Görselleri `apps/web/public/neo`, `apps/mobile/assets/neo` ve gerekenleri `apps/admin/public/neo` içine
  koymak; `Sticker.tsx` listelerine eklemek (oran = yükseklik / genişlik).
- "Ne taşıyoruz" kartlarında ikonları görsellerle değiştirmek (64 px, döndürmesiz, eşit boyut).
- Yeni çıkartmaları tablodaki yerlere bağlamak; mağaza görsellerini `pnpm brand:store` ile yenilemek.
- `kutu.png` yenisi gelince: üç uygulamadaki eski dosyanın yerine koymak.
