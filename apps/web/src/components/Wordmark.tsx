import { BRAND } from "@yazgan/shared";

/** Neo logo yazısı: marka kısa adı (BRAND) + limon ok + slogan */
export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className="block py-1">
      <span className={`relative block font-black leading-none ${small ? "text-3xl tracking-[-0.04em]" : "text-4xl tracking-[-0.045em]"}`}>
        {BRAND.shortName.toLocaleUpperCase("tr-TR")}
        <svg
          viewBox="0 0 40 22"
          aria-hidden="true"
          className={`absolute ${small ? "left-[15px] top-[10px] h-[15px] w-[28px]" : "left-[19px] top-[12px] h-[19px] w-[35px]"}`}
        >
          <path d="M2 16 L26 9" stroke="#D6FB45" strokeWidth="7" strokeLinecap="round" />
          <path d="M20 3 L34 7 L25 18" fill="none" stroke="#D6FB45" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="mt-1 block text-[9px] font-extrabold tracking-[0.4em]">{BRAND.tagline.toLocaleUpperCase("tr-TR")}</span>
    </span>
  );
}
