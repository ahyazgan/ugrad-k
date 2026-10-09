/** Accessible FAQ accordion built on native <details>/<summary> (works without JavaScript). */
export function FaqAccordion({ items, className = "" }: { items: Array<{ q: string; a: string }>; className?: string }) {
  return (
    <div className={`divide-y divide-neo-bg rounded-3xl bg-white shadow-[0_1px_2px_rgba(17,17,20,0.04),0_14px_34px_-20px_rgba(17,17,20,0.28)] ${className}`}>
      {items.map((f) => (
        <details key={f.q} className="group px-5 py-1 sm:px-6">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-bold text-brand [&::-webkit-details-marker]:hidden">
            <span>{f.q}</span>
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neo-bg text-lg leading-none font-black transition group-open:rotate-45 group-open:bg-accent"
            >
              +
            </span>
          </summary>
          <p className="pr-10 pb-4 text-slate-600">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
