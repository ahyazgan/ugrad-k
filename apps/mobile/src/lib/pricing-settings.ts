/**
 * Canlı fiyat ayarları (panel → Fiyatlar). Yalnız ekrandaki ipuçları için kullanılır
 * (ör. "+150 TL", "%15 indirim"); gerçek fiyat her zaman sunucuda yeniden hesaplanır.
 *
 * İlk render varsayılan ayarlarla yapılır, tablo okununca güncellenir. Ayarlar oturum
 * boyunca bir kez okunur ve bellekte tutulur (tüm ekranlar aynı isteği paylaşır);
 * okunamazsa varsayılanlar gösterilmeye devam eder, sonraki ekran yeniden dener.
 */
import { DEFAULT_PRICING_SETTINGS, type PricingSettings } from "@yazgan/shared";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { createPricingSettingsCache } from "@/lib/pricing-settings-core";

export { corporateTiersText } from "@/lib/pricing-settings-core";

const cache = createPricingSettingsCache(() => api.getPricingSettings());

/** Live pricing settings for display hints; DEFAULT_PRICING_SETTINGS until (or unless) loaded. */
export function usePricingSettings(): PricingSettings {
  const [settings, setSettings] = useState<PricingSettings>(() => cache.current() ?? DEFAULT_PRICING_SETTINGS);
  useEffect(() => {
    // Resolves immediately when cached; setting the same object again does not re-render
    let alive = true;
    cache.load().then(
      (s) => {
        if (alive) setSettings(s);
      },
      // Read failed (offline etc.): keep the defaults; the server-side price is authoritative anyway
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);
  return settings;
}
