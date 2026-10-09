import type { ReactNode } from "react";
import { Sticker, type StickerName } from "@/components/Sticker";

/** Shared H1 style for inner pages: Archivo 800, tight tracking. Exported for pages with custom hero layouts. */
export const PAGE_H1 = "text-5xl leading-[0.95] font-extrabold tracking-[-0.03em] text-brand lg:text-6xl";

/**
 * Inner page title block: one H1 (Archivo 800, 5xl → 6xl) with a single sticker on its right
 * (mobile w-14, desktop w-20, tilted ±6°), optional handwritten note, lead paragraph and actions.
 * `art` replaces the sticker with a larger element (e.g. a <Scene>) in the same slot.
 */
export function PageHero({
  title,
  sticker,
  tilt = "right",
  art,
  note,
  lead,
  children,
  className = "",
}: {
  title: ReactNode;
  sticker?: StickerName;
  tilt?: "left" | "right";
  /** Larger illustration shown to the right of the title instead of `sticker` */
  art?: ReactNode;
  /** Optional Caveat label rendered under the title (counts toward the 1–2 per page budget) */
  note?: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-4">
        <h1 className={PAGE_H1}>{title}</h1>
        {art ??
          (sticker ? (
            <Sticker name={sticker} priority className={`mt-1 -mb-4 w-14 shrink-0 lg:-mb-6 lg:w-20 ${tilt === "right" ? "rotate-6" : "-rotate-6"}`} />
          ) : null)}
      </div>
      {note ? <div className="mt-3">{note}</div> : null}
      {lead ? <div className="mt-4 max-w-2xl text-lg font-medium text-neo-muted-dark">{lead}</div> : null}
      {children}
    </div>
  );
}
