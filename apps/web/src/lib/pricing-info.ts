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
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  rows.push(
    { label: `Ekonomi: gün içinde teslim (Pzt–Cmt ${hh(s.nightEndHour)}–${hh(s.economyCutoffHour)} arası alış)`, value: `−%${s.economyDiscountPct}` },
    { label: "Acil teslimat (60 dakika)", value: `+%${s.urgentSurchargePct}` },
    { label: `Gece (${hh(s.nightStartHour)}–${hh(s.nightEndHour)})`, value: `+%${s.nightSurchargePct}` },
    { label: "Pazar", value: `+%${s.sundaySurchargePct}` },
    { label: "Resmi tatil (arife 13:00'ten itibaren)", value: `+%${s.nightHolidaySurchargePct}` },
  );
  rows.push({ label: "Gece, Pazar ve tatil ekleri birlikte gelirse", value: "yalnızca en yükseği" });
  if (s.maxSurchargePct != null) rows.push({ label: "Ek ücretlerin toplamı en fazla", value: `%${s.maxSurchargePct}` });
  rows.push(
    { label: `Bekleme (ilk ${s.waitingFreeMinutes} dk ücretsiz), her ${s.waitingBlockMinutes} dk`, value: tl(s.waitingBlockFeeKurus) },
    { label: "Gidiş-dönüş: dönüş ayağında indirim", value: `%${s.returnLegDiscountPct}` },
    { label: `${s.heavyThresholdKg} kg üzeri / büyük paket`, value: `+${tl(s.heavySurchargeKurus)}` },
    { label: "Avrupa yakasına köprü geçişi", value: `+${tl(s.bridgeFeeKurus)}` },
  );
  if (s.remotePickupPerKmKurus > 0) {
    rows.push({
      label: `Uzak alış: merkezimize ${s.freePickupRadiusKm} km'den uzak adreslerde km başına (en fazla ${tl(s.remotePickupMaxKurus)})`,
      value: `+${tl(s.remotePickupPerKmKurus)}`,
    });
  }
  if (s.maxWeightKg != null) rows.push({ label: "Motosikletle taşınabilen en fazla ağırlık", value: `${s.maxWeightKg} kg` });
  return rows;
}

export function corporateRows(s: PricingSettings = DEFAULT_PRICING_SETTINGS) {
  return s.corporateTiers.map((t) => ({ label: `Ayda ${t.minDeliveries}+ teslimat`, value: `%${t.discountPct} indirim` }));
}

export const VAT_PCT = DEFAULT_PRICING_SETTINGS.vatPct;
