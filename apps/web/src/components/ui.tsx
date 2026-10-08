import type { ElementType, ReactNode } from "react";

/**
 * Neo card surface: white, borderless, rounded-3xl with a soft shadow.
 * Same surface as the home page cards — use this instead of `border border-slate-200` boxes.
 */
export const CARD = "rounded-3xl bg-white shadow-[0_1px_2px_rgba(17,17,20,0.04),0_14px_34px_-20px_rgba(17,17,20,0.28)]";

export function Card({
  as: Tag = "div",
  className = "",
  children,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  id?: string;
  "data-testid"?: string;
}) {
  return (
    <Tag className={`${CARD} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * Handwritten (Caveat Brush) label. Decorative by default (aria-hidden); max 1–2 per page.
 * `lime` = lime chip with ink text, `ink` = plain ink text.
 */
export function HandNote({
  children,
  variant = "lime",
  className = "",
  decorative = true,
}: {
  children: ReactNode;
  variant?: "lime" | "ink";
  className?: string;
  decorative?: boolean;
}) {
  const look = variant === "lime" ? "rounded-xl bg-accent px-3 pt-1.5 pb-1 text-brand" : "text-brand";
  return (
    <span
      aria-hidden={decorative ? "true" : undefined}
      className={`inline-block font-[family-name:var(--font-hand)] text-2xl leading-none ${look} ${className}`}
    >
      {children}
    </span>
  );
}

/** "Örnek" stamp for mock-ups (sample receipts, invoices, routes). Readable by screen readers on purpose. */
export function SampleStamp({ className = "", label = "Örnek" }: { className?: string; label?: string }) {
  return (
    <span
      className={`inline-block rounded-lg border-2 border-brand px-2 py-0.5 text-[11px] font-black tracking-[0.18em] text-brand uppercase ${className}`}
    >
      {label}
    </span>
  );
}
