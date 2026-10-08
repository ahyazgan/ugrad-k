"use client";

import { useEffect, useRef, useState } from "react";

export interface Bar {
  /** Eksen etiketi (kısa) */
  label: string;
  value: number;
  /** İpucu başlığı (ör. tam tarih) */
  title: string;
}

const BRAND = "#0f3d6e";
const BRAND_HOVER = "#1d5c9c";
const GAP = 2;
const RADIUS = 4;
const PAD = { top: 12, right: 8, bottom: 24, left: 56 };

/** Ekseni okunur adımlara yuvarla (1, 2, 2.5, 5 × 10ⁿ) */
export function niceMax(v: number, ticks = 4): number {
  if (v <= 0) return ticks;
  const raw = v / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return step * ticks;
}

/** Üstü yuvarlatılmış, tabanı düz çubuk */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * Tek seri çubuk grafik. Tek renk, sade ızgara, her çubukta üzerine gelince ipucu.
 * `labelEvery` x ekseninde kaç çubukta bir etiket yazılacağını belirler.
 */
export function BarChart({
  data,
  format,
  axisFormat = format,
  height = 220,
  labelEvery = 1,
  ariaLabel,
}: {
  data: Bar[];
  format: (v: number) => string;
  /** Eksen etiketleri için kısa biçim (varsayılan: format) */
  axisFormat?: (v: number) => string;
  height?: number;
  labelEvery?: number;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ticks = 4;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)), ticks);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(1, Math.min(32, band - GAP));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const h = hover != null ? data[hover] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const v = (max / ticks) * i;
            return (
              <g key={i}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={i ? "#eef2f6" : "#cbd5e1"} />
                <text x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="#64748b">
                  {axisFormat(v)}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            const top = y(d.value);
            return (
              <g key={i}>
                {d.value > 0 ? (
                  <path d={barPath(cx - barW / 2, top, barW, PAD.top + plotH - top)} fill={hover === i ? BRAND_HOVER : BRAND} />
                ) : null}
                {i % labelEvery === 0 ? (
                  <text x={cx} y={height - 6} textAnchor="middle" fontSize={11} fill="#64748b">
                    {d.label}
                  </text>
                ) : null}
                {/* İsabet alanı çubuktan büyük: tüm sütun */}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  tabIndex={-1}
                />
              </g>
            );
          })}
        </svg>
      ) : null}
      {h && hover != null ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(PAD.left + band * hover + band / 2, 70), width - 70),
            top: Math.max(y(h.value) - 6, 40),
          }}
        >
          <div className="text-slate-500">{h.title}</div>
          <div className="font-semibold text-slate-900">{format(h.value)}</div>
        </div>
      ) : null}
    </div>
  );
}
