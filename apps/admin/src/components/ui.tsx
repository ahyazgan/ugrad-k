"use client";

import Image from "next/image";
import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

type ButtonVariant = "primary" | "accent" | "secondary" | "danger" | "ghost";

/** Shared button look; also used by links styled as buttons (`buttonClass`) */
export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
    variant === "primary" && "bg-brand text-white hover:bg-brand-dark",
    // Lime is a background-only accent: always paired with ink text
    variant === "accent" && "bg-accent text-brand hover:brightness-95",
    variant === "secondary" && "border border-line bg-white text-brand hover:bg-canvas",
    variant === "danger" && "bg-red-700 text-white hover:bg-red-800",
    variant === "ghost" && "text-brand hover:bg-brand-light",
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button {...props} className={cx(buttonClass(variant, size), className)} />;
}

const controlClass =
  "w-full rounded-control border border-line bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-light";

export function Input({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const input = <input {...props} className={cx(controlClass, className)} />;
  if (!label) return input;
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-ink-soft">
      {label}
      {input}
    </label>
  );
}

export function Select({
  label,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const select = (
    <select {...props} className={cx(controlClass, className)}>
      {children}
    </select>
  );
  if (!label) return select;
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-ink-soft">
      {label}
      {select}
    </label>
  );
}

/** Tables rendered inside a Card drop their own frame (see Table `bare`) */
const InCard = createContext(false);

export function Card({
  title,
  actions,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx("rounded-card border border-line bg-white p-4", className)}>
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title ? <h2 className="text-base font-bold leading-6 text-brand">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      <InCard.Provider value={true}>{children}</InCard.Provider>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-extrabold leading-8 tracking-[-0.03em] text-brand">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-control bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

export type Tone = "default" | "ok" | "warn" | "critical";
const TONE_TEXT: Record<Tone, string> = {
  default: "text-brand",
  ok: "text-emerald-700",
  warn: "text-amber-700",
  critical: "text-red-700",
};

/** KPI tile. `href` turns the whole tile into a link, `onClick` into a button. */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  href,
  onClick,
  pressed,
  testId,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  href?: string;
  onClick?: () => void;
  pressed?: boolean;
  testId?: string;
}) {
  const body = (
    <>
      <span className="block text-[13px] font-medium text-muted">{label}</span>
      <span className={cx("mt-1 block text-[26px] font-extrabold leading-8 tracking-[-0.02em] tabular-nums", TONE_TEXT[tone])}>{value}</span>
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </>
  );
  const cls = "block rounded-card border border-line bg-white p-4";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        data-testid={testId}
        className={cx(cls, "w-full text-left transition hover:border-brand/30 hover:bg-canvas", pressed && "border-brand ring-2 ring-brand-light")}
      >
        {body}
      </button>
    );
  }
  return href ? (
    <Link href={href} className={cx(cls, "transition hover:border-brand/30 hover:bg-canvas")} data-testid={testId}>
      {body}
    </Link>
  ) : (
    <div className={cls} data-testid={testId}>
      {body}
    </div>
  );
}

/**
 * Data table. Inside a Card it renders `bare` (no own frame) unless told otherwise.
 * `num` lists column indexes that hold amounts/counts: right aligned, tabular figures.
 */
export function Table({
  head,
  children,
  empty,
  bare,
  num = [],
  className,
}: {
  head: ReactNode[];
  children: ReactNode;
  empty?: ReactNode;
  bare?: boolean;
  num?: number[];
  className?: string;
}) {
  const inCard = useContext(InCard);
  const isBare = bare ?? inCard;
  const rows = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  const hasRows = rows.length > 0;
  return (
    <div className={cx("overflow-x-auto", !isBare && "rounded-card border border-line bg-white", className)}>
      <table className="w-full text-left text-[13px] tabular-nums">
        <thead className={cx("text-[11px] uppercase tracking-wide text-muted", isBare ? "border-b border-line" : "bg-canvas")}>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={cx("whitespace-nowrap px-3 py-2.5 font-semibold", num.includes(i) && "text-right", isBare && "first:pl-0 last:pr-0")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={cx("divide-y divide-line", isBare && "[&_td:first-child]:pl-0 [&_td:last-child]:pr-0")}>{children}</tbody>
      </table>
      {!hasRows ? (
        typeof empty === "string" || empty == null ? (
          <p className="px-3 py-6 text-center text-sm text-muted">{empty ?? "Kayıt yok"}</p>
        ) : (
          <div className="py-4">{empty}</div>
        )
      ) : null}
    </div>
  );
}

export const Td = ({ children, className, num }: { children?: ReactNode; className?: string; num?: boolean }) => (
  <td className={cx("px-3 py-2.5 align-top text-slate-800", num && "whitespace-nowrap text-right tabular-nums", className)}>{children}</td>
);

export type Sticker = "motor" | "kutu" | "bina" | "zarf" | "fis" | "kask" | "pin" | "yildiz" | "telefon";

/** Empty state: optional Neo sticker (max one per screen), title, explanation and next step */
export function EmptyState({
  sticker,
  title,
  description,
  action,
  className,
}: {
  sticker?: Sticker;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center px-4 py-6 text-center", className)}>
      {sticker ? <Image src={`/neo/${sticker}.png`} alt="" width={96} height={96} className="mb-3 h-24 w-24 object-contain" /> : null}
      <p className="text-sm font-bold text-brand">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Filter chip with optional count ("Yolda · 4") */
export function Chip({
  active,
  onClick,
  children,
  count,
  tone = "default",
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  tone?: Tone;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition",
        active ? "border-brand bg-brand text-white" : "border-line bg-white text-ink-soft hover:border-brand/40",
      )}
    >
      {children}
      {count != null ? (
        <span className={cx("tabular-nums", active ? "text-white/70" : tone === "critical" && count ? "text-red-700" : tone === "warn" && count ? "text-amber-700" : "text-muted")}>
          · {count}
        </span>
      ) : null}
    </button>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Side drawer for forms (keeps page columns free). Escape / backdrop closes it,
 * focus moves into the panel on open, Tab / Shift+Tab stay inside the panel
 * while it is open, and focus returns to the opener on close.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = panel.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-drawer-close])");
    (first ?? panel.current)?.focus();

    const focusables = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.getClientRects().length > 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      // Focus trap: Tab / Shift+Tab cycle inside the panel
      const items = focusables();
      const active = document.activeElement;
      const inside = active instanceof Node && panel.current.contains(active);
      if (!items.length) {
        e.preventDefault();
        panel.current.focus();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (e.shiftKey && (!inside || active === firstEl || active === panel.current)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (!inside || active === lastEl)) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    // Focus that escapes by other means (e.g. programmatic) is pulled back into the panel
    const onFocusIn = (e: FocusEvent) => {
      if (panel.current && e.target instanceof Node && !panel.current.contains(e.target)) {
        (focusables()[0] ?? panel.current).focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocusIn);
      document.body.style.overflow = overflow;
      // Return focus to the control that opened the drawer
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1100] flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-brand/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className="relative flex outline-none h-full w-full max-w-md animate-drawer-in flex-col border-l border-line bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-extrabold tracking-[-0.02em] text-brand">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            data-drawer-close
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-control px-2 py-1 text-xl leading-none text-muted hover:bg-canvas hover:text-brand"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
