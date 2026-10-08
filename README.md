# Yazgan Kurye

İstanbul moto kurye hizmeti için tanıtım sitesi, müşteri + kurye mobil uygulaması, yönetim paneli ve sunucu.
Proje rehberi: [CLAUDE.md](CLAUDE.md) · Kurulum: [docs/kurulum.md](docs/kurulum.md) · Mağaza: [docs/magaza.md](docs/magaza.md) · Fiyat araştırması: [docs/fiyat-arastirmasi.md](docs/fiyat-arastirmasi.md)

| Klasör | İçerik |
|---|---|
| `packages/shared` | Fiyat hesabı (tek kaynak), sipariş durumları, yaka/köprü, harita, bildirim kuralları, yasal metinler |
| `apps/mobile` | Expo (React Native) — müşteri ve kurye uygulaması |
| `apps/admin` | Next.js yönetim paneli + herkese açık takip/yasal sayfalar |
| `apps/web` | Next.js tanıtım sitesi: fiyat hesaplayıcı, ilçe sayfaları, kurumsal/kurye başvurusu, API belgeleri |
| `supabase/` | Veritabanı şeması, güvenlik kuralları, Edge Functions (sipariş, ödeme, fatura, bildirim, yapay zeka asistanı) |

## Hızlı başlangıç (anahtar olmadan, DEMO modunda)
```bash
pnpm install
pnpm --filter @yazgan/admin dev        # http://localhost:3000  (admin@yazgankurye.com / demo1234)
pnpm --filter @yazgan/mobile start     # Expo — herhangi bir numara, kod 123456; kurye: 0555 000 00 00
pnpm --filter @yazgan/web dev          # http://localhost:3200  tanıtım sitesi
```

## Testler
```bash
pnpm test            # birim testleri
pnpm test:functions  # Edge Function testleri (Deno)
pnpm test:db         # migration + güvenlik kuralları (yerel PostgreSQL)
pnpm --filter @yazgan/mobile export:web && pnpm --filter @yazgan/mobile e2e:web   # uçtan uca
pnpm --filter @yazgan/admin build && pnpm --filter @yazgan/admin e2e:web
pnpm --filter @yazgan/web build && pnpm --filter @yazgan/web e2e:web
```
