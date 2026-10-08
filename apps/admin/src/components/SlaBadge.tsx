"use client";

import { istanbulTime } from "@yazgan/shared";
import type { AdminOrder } from "@/lib/repo";

/** Acil siparişin taahhüt durumu: kalan süre, gecikti veya kaçırıldı */
export function SlaBadge({ o, now }: { o: Pick<AdminOrder, "slaDueAt" | "slaMissed" | "status" | "deliveredAt">; now: number }) {
  if (!o.slaDueAt || o.status === "iptal") return null;
  if (o.deliveredAt) {
    return o.slaMissed ? <div className="text-xs font-semibold text-red-700">Taahhüt kaçtı</div> : null;
  }
  const left = Math.round((new Date(o.slaDueAt).getTime() - now) / 60_000);
  if (left < 0) return <div className="text-xs font-bold text-red-700">GECİKTİ ({-left} dk)</div>;
  return (
    <div className={`text-xs font-semibold ${left <= 15 ? "text-amber-700" : "text-slate-600"}`} title={`Taahhüt ${istanbulTime(o.slaDueAt)}`}>
      ⏱ {left} dk kaldı
    </div>
  );
}
