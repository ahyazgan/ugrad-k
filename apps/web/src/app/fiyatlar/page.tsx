import type { Metadata } from "next";
import Link from "next/link";
import { PriceCalculator } from "@/components/PriceCalculator";
import { corporateRows, pricingRows, VAT_PCT } from "@/lib/pricing-info";

export const metadata: Metadata = {
  title: "Moto kurye fiyatları ve fiyat hesaplama",
  description: "Şeffaf moto kurye tarifesi: açılış ücreti, kademeli km ücreti, acil ve gece ek ücretleri, gidiş-dönüş indirimi. Adresi girin, fiyatı anında görün.",
  alternates: { canonical: "/fiyatlar" },
};

export default function FiyatlarPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-slate-900">Fiyatlar</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Fiyat, alış ve teslim adresleri arasındaki gerçek sürüş mesafesinden hesaplanır. Tüm kalemler sipariş öncesinde açıkça gösterilir. Tutarlara %{VAT_PCT} KDV eklenir.
      </p>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_440px]">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Tarife (KDV hariç)</h2>
          <table className="mt-3 w-full overflow-hidden rounded-2xl border border-slate-200 text-sm" data-testid="tariff">
            <tbody>
              {pricingRows().map((r) => (
                <tr key={r.label} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 text-slate-700">{r.label}</td>
                  <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-4 space-y-1 text-sm text-slate-600">
            <li>• Km, sürüş mesafesine göre yukarı yuvarlanır.</li>
            <li>• Gece, Pazar ve resmi tatil ekleri toplanmaz, yalnızca en yükseği uygulanır; arife günleri 13:00&apos;ten itibaren tatil sayılır.</li>
            <li>• Ekonomi gönderiler aynı gün içinde, uygun kurye rotasıyla teslim edilir.</li>
            <li>• Acil teslimde 60 dakika taahhüdü: kaçırırsak acil ek ücreti sonraki siparişinizden düşülür.</li>
            <li>• Gidiş-dönüşte dönüş ayağı, ek ücretler dahil fiyatın yarısıdır; köprü ücreti indirimsizdir.</li>
            <li>• Köprü ücreti yalnızca Anadolu yakasından Avrupa yakasına geçişte uygulanır.</li>
          </ul>
          <h2 className="mt-10 text-xl font-bold text-slate-900">Kurumsal indirim</h2>
          <table className="mt-3 w-full rounded-2xl border border-slate-200 text-sm">
            <tbody>
              {corporateRows().map((r) => (
                <tr key={r.label} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 text-slate-700">{r.label}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-sm text-slate-600">
            İndirim ay sonu faturasındaki taşıma bedeline (açılış, km, hizmet ve zaman ekleri) uygulanır; köprü, bekleme, ağır paket ve uzak alış ücretleri indirimsizdir.{" "}
            <Link href="/kurumsal" className="font-semibold text-brand underline">
              Kurumsal hesap başvurusu
            </Link>
          </p>
        </div>
        <div>
          <h2 className="mb-3 text-xl font-bold text-slate-900">Hesaplayın</h2>
          <PriceCalculator compact />
        </div>
      </div>
    </div>
  );
}
