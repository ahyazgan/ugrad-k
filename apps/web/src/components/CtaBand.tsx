import Link from "next/link";
import { Sticker } from "@/components/Sticker";
import { APP_URL } from "@/lib/site";

/** Lime call-to-action band rendered above the footer on every page (root layout). */
export function CtaBand() {
  return (
    <section aria-labelledby="cta-band-title" className="mx-auto w-full max-w-6xl px-4 pt-14 pb-16 lg:pt-16">
      <div className="relative overflow-visible rounded-[32px] bg-accent px-6 py-8 sm:px-10 sm:py-10">
        <Sticker
          name="motor"
          className="absolute -top-14 right-3 w-20 -rotate-3 sm:-top-12 sm:right-6 sm:w-32 lg:-top-8 lg:-right-2 xl:-right-8"
        />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:pr-28">
          <div className="pr-12 sm:pr-32 lg:pr-0">
            <h2 id="cta-band-title" className="text-3xl leading-tight font-black tracking-[-0.03em] text-brand sm:text-4xl">
              Fiyatı adres yazarak görün.
            </h2>
            <p className="mt-2 max-w-xl font-semibold text-brand/80">Kalem kalem, sipariş vermeden önce. Kurye yola çıkmadan neyi ödeyeceğinizi bilirsiniz.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
            <a href={APP_URL} className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-brand px-7 text-lg font-extrabold text-white hover:bg-black">
              Sipariş ver <span aria-hidden="true">→</span>
            </a>
            <Link href="/kurumsal" className="flex min-h-14 items-center justify-center rounded-full bg-white px-7 text-lg font-extrabold text-brand hover:bg-brand hover:text-white">
              Kurumsal hesap
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
