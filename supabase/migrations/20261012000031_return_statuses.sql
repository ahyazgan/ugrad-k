-- Teslim edilemeyen gönderinin göndericiye iadesi için iki yeni durum (ayrı dosya: yeni enum değeri
-- aynı işlem içinde kullanılamaz). Akış ve kurallar 20261012000032_failed_delivery.sql içinde.
--  • geri_donuyor: alıcıya ulaşılamadı, paket göndericiye geri götürülüyor
--  • geri_teslim: paket göndericiye geri teslim edildi (son durum)
alter type public.order_status add value if not exists 'geri_donuyor';
alter type public.order_status add value if not exists 'geri_teslim';
