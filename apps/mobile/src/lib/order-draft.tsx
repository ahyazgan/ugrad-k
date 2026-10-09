import { createContext, useContext, useState, type ReactNode } from "react";
import type { ServiceLevel } from "@yazgan/shared";
import type { DraftPoint, OrderDetail, OrderInput } from "./api";
import { districtFromAddress } from "./recent";

/**
 * "Aynı rotayla tekrar gönder": geçmiş siparişin adreslerini (tarif ve kişilerle) taslağa taşır.
 * Paket, hizmet seviyesi ve ödeme yeniden seçilir; fiyat her zaman yeniden hesaplanır.
 */
export function routeFromOrder(
  o: Pick<
    OrderDetail,
    | "pickupAddress"
    | "pickupLat"
    | "pickupLng"
    | "pickupDetails"
    | "pickupContactName"
    | "pickupContactPhone"
    | "dropoffAddress"
    | "dropoffLat"
    | "dropoffLng"
    | "dropoffDetails"
    | "dropoffContactName"
    | "dropoffContactPhone"
  >,
): Partial<Draft> {
  return {
    pickup: { address: o.pickupAddress, lat: o.pickupLat, lng: o.pickupLng, details: o.pickupDetails ?? undefined, district: districtFromAddress(o.pickupAddress) },
    dropoff: { address: o.dropoffAddress, lat: o.dropoffLat, lng: o.dropoffLng, details: o.dropoffDetails ?? undefined, district: districtFromAddress(o.dropoffAddress) },
    pickupContactName: o.pickupContactName ?? "",
    pickupContactPhone: o.pickupContactPhone ?? "",
    dropoffContactName: o.dropoffContactName ?? "",
    dropoffContactPhone: o.dropoffContactPhone ?? "",
  };
}

export interface Draft {
  pickup: DraftPoint | null;
  dropoff: DraftPoint | null;
  serviceLevel: ServiceLevel;
  roundTrip: boolean;
  weightKg: string;
  largePackage: boolean;
  /** TL, boşsa beyan yok */
  declaredValue: string;
  deliveryCode: boolean;
  /** Kampanya veya davet kodu (özet ekranında) */
  promoCode: string;
  packageDescription: string;
  customerNote: string;
  pickupContactName: string;
  pickupContactPhone: string;
  dropoffContactName: string;
  dropoffContactPhone: string;
  paymentMethod: OrderInput["paymentMethod"];
}

const EMPTY: Draft = {
  pickup: null,
  dropoff: null,
  serviceLevel: "standart",
  roundTrip: false,
  weightKg: "",
  largePackage: false,
  declaredValue: "",
  deliveryCode: false,
  promoCode: "",
  packageDescription: "",
  customerNote: "",
  pickupContactName: "",
  pickupContactPhone: "",
  dropoffContactName: "",
  dropoffContactPhone: "",
  // Faz 6'da kartla online ödeme gelene kadar varsayılan: kuryeye ödeme
  paymentMethod: "nakit",
};

/** Form → Edge Function gövdesi. Eksik adres varsa null. */
export function draftToInput(d: Draft): OrderInput | null {
  if (!d.pickup || !d.dropoff) return null;
  const weight = d.weightKg.replace(",", ".").trim();
  const declared = d.declaredValue.replace(/\./g, "").replace(",", ".").trim();
  return {
    pickup: { ...d.pickup, contactName: d.pickupContactName || undefined, contactPhone: d.pickupContactPhone || undefined },
    dropoff: { ...d.dropoff, contactName: d.dropoffContactName || undefined, contactPhone: d.dropoffContactPhone || undefined },
    serviceLevel: d.serviceLevel,
    roundTrip: d.roundTrip,
    weightKg: weight ? Number(weight) : null,
    largePackage: d.largePackage,
    declaredValueKurus: declared ? Math.round(Number(declared) * 100) : null,
    deliveryCode: d.deliveryCode,
    promoCode: d.promoCode.trim() || undefined,
    packageDescription: d.packageDescription || undefined,
    customerNote: d.customerNote || undefined,
    scheduledPickupAt: null,
    paymentMethod: d.paymentMethod,
  };
}

const Ctx = createContext<{
  draft: Draft;
  update(patch: Partial<Draft>): void;
  reset(): void;
} | null>(null);

export function OrderDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  return (
    <Ctx.Provider
      value={{
        draft,
        update: (patch) => setDraft((d) => ({ ...d, ...patch })),
        reset: () => setDraft(EMPTY),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useOrderDraft() {
  const v = useContext(Ctx);
  if (!v) throw new Error("OrderDraftProvider eksik");
  return v;
}
