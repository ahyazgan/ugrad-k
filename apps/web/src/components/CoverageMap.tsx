import { Sticker } from "@/components/Sticker";
import { DISTRICTS } from "@/lib/districts";

/**
 * Schematic (not to scale) coverage map of Istanbul's two sides, drawn as inline SVG so it needs
 * no map service, API key or third-party request. District positions are approximate, for orientation only.
 */
const W = 600;
const H = 330;

/** Approximate schematic positions in the 600×330 viewBox, keyed by district slug. */
const POS: Record<string, [number, number]> = {
  sariyer: [245, 62],
  kagithane: [200, 118],
  sisli: [212, 160],
  besiktas: [268, 142],
  beyoglu: [236, 202],
  beykoz: [398, 104],
  uskudar: [338, 190],
  kadikoy: [334, 232],
  umraniye: [404, 168],
  atasehir: [398, 214],
  cekmekoy: [462, 122],
  sancaktepe: [492, 182],
  maltepe: [420, 248],
  kartal: [472, 258],
  pendik: [522, 270],
  tuzla: [568, 282],
};

const EUROPE = "M0,34 L318,34 C310,52 304,62 306,74 C309,92 318,102 312,116 C304,134 290,142 287,160 C284,180 282,196 270,214 C262,228 258,238 252,246 L0,256 Z";
const ANATOLIA =
  "M344,34 L600,34 L600,302 C572,298 548,294 520,288 C492,282 470,276 450,272 C420,266 396,262 376,258 C352,254 322,252 300,250 C298,234 300,216 304,200 C310,180 314,166 322,150 C330,134 342,120 340,104 C338,88 330,76 332,62 C334,50 340,42 344,34 Z";

export function CoverageMap({ className = "" }: { className?: string }) {
  const center = POS.beykoz!;
  return (
    <figure className={`relative ${className}`}>
      <div className="relative overflow-hidden rounded-3xl bg-[#d9d0fb]" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <path d={EUROPE} fill="#ffffff" />
          <path d={ANATOLIA} fill="#f3fcd2" />
          {/* Motorcycle-legal bridges: FSM (north) and 15 Temmuz (south) */}
          <g stroke="#111114" strokeWidth="4" strokeLinecap="round">
            <line x1="300" y1="98" x2="344" y2="94" />
            <line x1="282" y1="150" x2="330" y2="146" />
          </g>
          {DISTRICTS.map((d) => {
            const p = POS[d.slug];
            if (!p) return null;
            return <circle key={d.slug} cx={p[0]} cy={p[1]} r={d.slug === "beykoz" ? 7 : 5} fill={d.side === "anadolu" ? "#9bc20f" : "#111114"} stroke="#fff" strokeWidth="2" />;
          })}
        </svg>
        {/* HTML labels stay readable when the map scales down on phones */}
        <span className="absolute top-[14%] left-[3%] text-[10px] font-black tracking-[0.16em] text-neo-muted sm:text-xs">AVRUPA YAKASI</span>
        <span className="absolute top-[14%] right-[3%] text-right text-[10px] font-black tracking-[0.16em] text-brand sm:text-xs">ANADOLU YAKASI</span>
        <span className="absolute top-[1.5%] left-1/2 -translate-x-1/2 text-[9px] font-bold tracking-[0.14em] text-neo-inactive sm:text-[11px]">KARADENİZ</span>
        <span className="absolute bottom-[3%] left-[18%] text-[9px] font-bold tracking-[0.14em] text-neo-inactive sm:text-[11px]">MARMARA</span>
        {DISTRICTS.map((d) => {
          const p = POS[d.slug];
          if (!p || d.slug === "beykoz") return null;
          return (
            <span
              key={d.slug}
              className="absolute -translate-x-1/2 translate-y-[6px] text-[9px] leading-none font-bold whitespace-nowrap text-brand sm:translate-y-[8px] sm:text-[11px]"
              style={{ left: `${(p[0] / W) * 100}%`, top: `${(p[1] / H) * 100}%` }}
            >
              {d.name}
            </span>
          );
        })}
        <div
          className="absolute -translate-x-1/2 -translate-y-[92%]"
          style={{ left: `${(center[0] / W) * 100}%`, top: `${(center[1] / H) * 100}%` }}
        >
          <Sticker name="pin" className="w-8 -rotate-6 sm:w-12" />
          <span className="absolute top-1 left-full ml-1 rounded-full bg-brand px-2 py-0.5 text-[9px] font-extrabold whitespace-nowrap text-white sm:text-[11px]">
            Beykoz · merkez
          </span>
        </div>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neo-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-neo-dot" aria-hidden="true" /> Anadolu yakası (öncelikli)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-brand" aria-hidden="true" /> Avrupa yakası (köprü geçişli)
        </span>
        <span>Şematik harita, ölçeksizdir.</span>
      </figcaption>
    </figure>
  );
}
