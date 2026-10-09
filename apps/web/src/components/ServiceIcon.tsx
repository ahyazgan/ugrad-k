/**
 * Small single-colour line icons (24×24, currentColor stroke) for sober B2B lists.
 * Hand-drawn paths; no icon library. Decorative: the caller marks the wrapper aria-hidden.
 */
const PATHS = {
  // Envelope with a fold
  envelope: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.5 7 8.5 6.5L20.5 7" />
    </>
  ),
  // Courthouse: pediment, columns, base
  courthouse: (
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M4 9.5h16" />
      <path d="M6.5 12v5.5M10.5 12v5.5M13.5 12v5.5M17.5 12v5.5" />
      <path d="M3.5 20h17" />
    </>
  ),
  // Two opposing arrows: there and back
  roundTrip: (
    <>
      <path d="M4 8.5h14" />
      <path d="m15 5.5 3 3-3 3" />
      <path d="M20 15.5H6" />
      <path d="m9 12.5-3 3 3 3" />
    </>
  ),
  // Calendar with a clock hand: scheduled pickup
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="M12 12.5v3l2 1.5" />
    </>
  ),
  // Parcel box with tape
  box: (
    <>
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" />
      <path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
    </>
  ),
  // Briefcase: corporate account
  briefcase: (
    <>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5" />
      <path d="M3 12.5h18" />
    </>
  ),
} as const;

export type ServiceIconName = keyof typeof PATHS;

export function ServiceIcon({ name, className = "" }: { name: ServiceIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
