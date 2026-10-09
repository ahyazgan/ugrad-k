import { BRAND, COMPANY } from "@yazgan/shared";
import Link from "next/link";
import { DISTRICTS } from "@/lib/districts";
import { displayPhone, phoneLink, whatsappLink } from "@/lib/site";

export function Footer() {
  const wa = whatsappLink();
  return (
    <footer className="bg-brand-dark text-white/80">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-lg font-extrabold text-white">{BRAND.name}</div>
          <p className="mt-2 text-sm">{BRAND.slogan}.</p>
          <p className="mt-4 text-xs leading-relaxed">
            {COMPANY.title}
            <br />
            {COMPANY.address}
          </p>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Hizmet</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/fiyatlar" className="hover:text-white">Fiyatlar ve hesaplama</Link></li>
            <li><Link href="/kurumsal" className="hover:text-white">Kurumsal hesap</Link></li>
            <li><Link href="/api-belgeleri" className="hover:text-white">Kurumsal API</Link></li>
            <li><Link href="/kurye-ol" className="hover:text-white">Kurye olun</Link></li>
            <li><Link href="/sss" className="hover:text-white">Sık sorulan sorular</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Bölgeler</div>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            {DISTRICTS.slice(0, 10).map((d) => (
              <li key={d.slug}>
                <Link href={`/hizmet-bolgeleri/${d.slug}`} className="hover:text-white">
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">İletişim</div>
          <ul className="mt-3 space-y-2 text-sm">
            {phoneLink ? <li><a href={phoneLink} className="hover:text-white">{displayPhone(BRAND.phone)}</a></li> : null}
            {wa ? <li><a href={wa} className="hover:text-white">WhatsApp</a></li> : null}
            <li><a href={`mailto:${BRAND.email.info}`} className="hover:text-white">{BRAND.email.info}</a></li>
            <li><Link href="/kvkk" className="hover:text-white">KVKK aydınlatma metni</Link></li>
            <li><Link href="/gizlilik" className="hover:text-white">Gizlilik politikası</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/60">
        © {new Date().getFullYear()} {BRAND.name}. Fiyatlara KDV dahil değildir.
      </div>
    </footer>
  );
}
