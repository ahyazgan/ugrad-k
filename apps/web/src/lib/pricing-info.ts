import { DEFAULT_PRICING_SETTINGS, formatTL, type PricingSettings } from "@yazgan/shared";

/** Tarife özetini (KDV hariç) okunur satırlara çevirir. Kaynak: packages/shared/pricing.ts */
export function pricingRows(s: PricingSettings = DEFAULT_PRICING_SETTINGS): Array<{ label: string; value: string }> {
  const tl = (k: number) => formatTL(k).replace(",00 TL", " TL");
  const rows = [{ label: `Açılış (ilk ${s.includedKm} km dahil)`, value: tl(s.baseFeeKurus) }];
  if (s.kmTiers.length) {
    let from = s.includedKm;
    for (const t of s.kmTiers) {
      rows.push({
        label: t.uptoKm == null ? `${from} km üzeri, km başına` : `${from}–${t.uptoKm} km arası, km başına`,
        value: tl(t.perKmKurus),
      });
      if (t.uptoKm != null) from = t.uptoKm;
    }
  } else {
    rows.push({ label: "Ek km başına", value: tl(s.perKmKurus) });
  }
  rows.push(
    { label: "Acil teslimat (60 dakika)", value: `+%${s.urgentSurchargePct}` },
    { label: `Gece (${String(s.nightStartHour).padStart(2, "0")}:00–${String(s.nightEndHour).padStart(2, "0")}:00) ve resmi tatil`, value: `+%${s.nightHolidaySurchargePct}` },
  );
  if (s.maxSurchargePct != null) rows.push({ label: "Ek ücretlerin toplamı en fazla", value: `%${s.maxSurchargePct}` });
  rows.push(
    { label: `Bekleme (ilk ${s.waitingFreeMinutes} dk ücretsiz), her ${s.waitingBlockMinutes} dk`, value: tl(s.waitingBlockFeeKurus) },
    { label: "Gidiş-dönüş: dönüş ayağında indirim", value: `%${s.returnLegDiscountPct}` },
    { label: `${s.heavyThresholdKg} kg üzeri / büyük paket`, value: `+${tl(s.heavySurchargeKurus)}` },
    { label: "Avrupa yakasına köprü geçişi", value: `+${tl(s.bridgeFeeKurus)}` },
  );
  return rows;
}

export function corporateRows(s: PricingSettings = DEFAULT_PRICING_SETTINGS) {
  return s.corporateTiers.map((t) => ({ label: `Ayda ${t.minDeliveries}+ teslimat`, value: `%${t.discountPct} indirim` }));
}

export const VAT_PCT = DEFAULT_PRICING_SETTINGS.vatPct;
