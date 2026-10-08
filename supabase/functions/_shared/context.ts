// Edge Function'ların gerçek bağımlılıkları (Supabase + harita sağlayıcısı).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  googleMapsProvider,
  holidayFromRow,
  mockMapsProvider,
  pricingSettingsFromRow,
  type Holiday,
  type MapsProvider,
  type PricingSettings,
} from "../../../packages/shared/index.ts";
import { HttpError } from "./http.ts";

export interface AuthUser {
  id: string;
  phone?: string;
}

export interface Ctx {
  maps: MapsProvider;
  admin: SupabaseClient;
  getUser(req: Request): Promise<AuthUser>;
  loadPricing(): Promise<{ settings: PricingSettings; holidays: Holiday[] }>;
}

const env = (k: string) => Deno.env.get(k) ?? "";

export function makeMaps(): MapsProvider {
  const key = env("GOOGLE_MAPS_API_KEY");
  if (env("MAPS_PROVIDER") === "mock" || !key) {
    if (env("MAPS_PROVIDER") === "google") throw new Error("GOOGLE_MAPS_API_KEY tanımlı değil");
    console.warn("GOOGLE_MAPS_API_KEY yok → sahte harita sağlayıcısı kullanılıyor");
    return mockMapsProvider();
  }
  return googleMapsProvider(key);
}

export function createCtx(): Ctx {
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    maps: makeMaps(),
    admin,
    async getUser(req) {
      const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      if (!token) throw new HttpError(401, "Giriş yapmanız gerekiyor");
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) throw new HttpError(401, "Oturum geçersiz, lütfen tekrar giriş yapın");
      return { id: data.user.id, phone: data.user.phone ?? undefined };
    },
    async loadPricing() {
      const today = new Date().toISOString().slice(0, 10);
      const [s, h] = await Promise.all([
        admin.from("pricing_settings").select("*").eq("id", 1).single(),
        admin.from("holidays").select("*").gte("date", today).limit(60),
      ]);
      if (s.error) throw new Error(`Fiyat ayarları okunamadı: ${s.error.message}`);
      return {
        settings: pricingSettingsFromRow(s.data),
        holidays: (h.data ?? []).map(holidayFromRow),
      };
    },
  };
}
