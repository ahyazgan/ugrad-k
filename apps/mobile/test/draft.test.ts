import { describe, expect, it } from "vitest";
import { draftToInput, type Draft } from "../src/lib/order-draft";

const base: Draft = {
  pickup: { address: "A", lat: 41.1, lng: 29.1, district: "Beykoz" },
  dropoff: { address: "B", lat: 41.0, lng: 29.0, district: "Kadıköy" },
  serviceLevel: "standart",
  roundTrip: false,
  weightKg: "",
  largePackage: false,
  declaredValue: "",
  deliveryCode: false,
  packageDescription: "",
  customerNote: "",
  pickupContactName: "",
  pickupContactPhone: "",
  dropoffContactName: "",
  dropoffContactPhone: "",
  paymentMethod: "nakit",
};

describe("draftToInput", () => {
  it("adres eksikse null", () => {
    expect(draftToInput({ ...base, dropoff: null })).toBeNull();
  });
  it("boş alanları undefined yapar, virgüllü ağırlığı çevirir", () => {
    const r = draftToInput({ ...base, weightKg: "2,5", pickupContactPhone: "0532" })!;
    expect(r.weightKg).toBe(2.5);
    expect(r.packageDescription).toBeUndefined();
    expect(r.pickup.contactPhone).toBe("0532");
    expect(r.dropoff.contactName).toBeUndefined();
  });
  it("hizmet seviyesini aktarır", () => {
    expect(draftToInput({ ...base, serviceLevel: "ekonomi" })!.serviceLevel).toBe("ekonomi");
  });
  it("değer beyanı TL → kuruş (binlik nokta, ondalık virgül)", () => {
    expect(draftToInput({ ...base, declaredValue: "25.000,50", deliveryCode: true })).toMatchObject({ declaredValueKurus: 2_500_050, deliveryCode: true });
    expect(draftToInput(base)!.declaredValueKurus).toBeNull();
  });
  it("ağırlık boşsa null", () => {
    expect(draftToInput(base)!.weightKg).toBeNull();
  });
});
