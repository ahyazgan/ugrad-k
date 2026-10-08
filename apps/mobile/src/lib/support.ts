// Operations contact numbers for the courier app. Never hard-code numbers in screens.
import { BRAND } from "@yazgan/shared";

/**
 * Dispatcher / manager phone for the SOS screen ("Yöneticiyi ara").
 * Order: EXPO_PUBLIC_DISPATCH_PHONE → BRAND.phone → empty (button hidden).
 */
export const DISPATCH_PHONE: string = (process.env.EXPO_PUBLIC_DISPATCH_PHONE || BRAND.phone || "").trim();
