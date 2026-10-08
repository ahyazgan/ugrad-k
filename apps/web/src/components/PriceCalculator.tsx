"use client";

import { formatTL, type PlaceDetails, type PlaceSuggestion } from "@yazgan/shared";
import { useEffect, useId, useRef, useState } from "react";
import { placeDetails, quote, searchPlaces, SiteApiError, type SiteQuote } from "@/lib/api";
import { APP_URL, whatsappLink } from "@/lib/site";

const newToken = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

function AddressField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: "pickup" | "dropoff";
  label: string;
  placeholder: string;
  value: PlaceDetails | null;
  onChange: (p: PlaceDetails | null) => void;
}) {
  const [text, setText] = useState(value?.address ?? "");
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(newToken());
  const listId = useId();

  useEffect(() => {
    if (value && text === value.address) return;
    const q = text.trim();
    if (q.length < 3) return;
    const t = setTimeout(() => {
      searchPlaces(q, token.current).then(
        (r) => {
          setItems(r);
          setActive(0);
          setOpen(true);
          setError(null);
        },
        (e: unknown) => setError(e instanceof SiteApiError ? e.message : "Adres aranamadı"),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [text, value]);

  async function pick(s: PlaceSuggestion) {
    setOpen(false);
    setText(s.subtitle || s.title);
    try {
      const p = await placeDetails(s.placeId, token.current);
      token.current = newToken(); // Google: oturum seçimle biter
      setText(p.address);
      onChange(p);
    } catch (e) {
      setError(e instanceof SiteApiError ? e.message : "Adres alınamadı");
    }
  }

  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className="mb-1 block text-sm font-semibold text-slate-700">
        {label}
      </label>
      <input
        id={`${id}-input`}
        data-testid={`${id}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (value) onChange(null);
          if (e.target.value.trim().length < 3) {
            setItems([]);
            setOpen(false);
          }
        }}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") setActive((a) => Math.min(items.length - 1, a + 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
          else if (e.key === "Enter") {
            e.preventDefault();
            pick(items[active]!);
          } else return;
          e.preventDefault();
        }}
      />
      {open && items.length ? (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {items.map((s, i) => (
            <li
              key={s.placeId}
              role="option"
              aria-selected={i === active}
              data-testid={`${id}-option-${i}`}
              className={`cursor-pointer px-4 py-2 text-sm ${i === active ? "bg-brand-light" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
            >
              <div className="font-semibold text-slate-900">{s.title}</div>
              <div className="text-xs text-slate-500">{s.subtitle}</div>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${checked ? "border-brand bg-brand-light" : "border-slate-200 bg-white"}`}>
      <input type="checkbox" data-testid={id} className="mt-0.5 h-4 w-4 accent-[#0f3d6e]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-semibold text-slate-900">{label}</span>
        <span className="text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

/** Adres → anında fiyat. Sunucuda uygulama ile aynı fiyat fonksiyonu (pricing.ts) çalışır. */
export function PriceCalculator({ compact = false }: { compact?: boolean }) {
  const [pickup, setPickup] = useState<PlaceDetails | null>(null);
  const [dropoff, setDropoff] = useState<PlaceDetails | null>(null);
  const [urgent, setUrgent] = useState(false);
  const [roundTrip, setRoundTrip] = useState(false);
  const [largePackage, setLargePackage] = useState(false);
  const [result, setResult] = useState<SiteQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pickup || !dropoff) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- yükleniyor durumu istekle eşzamanlı başlar
    setLoading(true);
    quote({ pickup, dropoff, urgent, roundTrip, largePackage }).then(
      (q) => {
        if (!alive) return;
        setResult(q);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (!alive) return;
        setResult(null);
        setError(e instanceof SiteApiError ? e.message : "Fiyat hesaplanamadı");
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [pickup, dropoff, urgent, roundTrip, largePackage]);

  const shown = pickup && dropoff ? result : null;
  const wa = shown
    ? whatsappLink(`Merhaba, ${pickup!.address} → ${dropoff!.address} için kurye istiyorum. Hesaplanan fiyat: ${formatTL(shown.quote.totalKurus)} (KDV dahil).`)
    : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-brand/5 sm:p-6" id="fiyat-hesapla">
      <div className="grid gap-4">
        <AddressField id="pickup" label="Nereden?" placeholder="Alış adresi, ör. Kavacık" value={pickup} onChange={setPickup} />
        <AddressField id="dropoff" label="Nereye?" placeholder="Teslim adresi, ör. Levent" value={dropoff} onChange={setDropoff} />
        <div className={`grid gap-2 ${compact ? "" : "sm:grid-cols-3"}`}>
          <Toggle id="opt-urgent" label="Acil" hint="60 dakikada teslim" checked={urgent} onChange={setUrgent} />
          <Toggle id="opt-roundtrip" label="Gidiş-dönüş" hint="İmzalatıp geri getir" checked={roundTrip} onChange={setRoundTrip} />
          <Toggle id="opt-large" label="Büyük paket" hint="10 kg üzeri" checked={largePackage} onChange={setLargePackage} />
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-5" aria-live="polite">
        {!pickup || !dropoff ? (
          <p className="text-sm text-slate-500">İki adresi seçin, fiyat anında hesaplansın.</p>
        ) : error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : !shown ? (
          <p className="text-sm text-slate-500">Hesaplanıyor…</p>
        ) : (
          <div className={loading ? "opacity-60" : undefined}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm text-slate-500">
                {(shown.distanceMeters / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} km · yaklaşık{" "}
                {Math.max(1, Math.round(shown.durationSeconds / 60))} dk sürüş
                {shown.bridgeCrossings ? " · köprü geçişi" : ""}
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold text-brand" data-testid="total">
                  {formatTL(shown.quote.totalKurus)}
                </div>
                <div className="text-xs text-slate-500">KDV dahil · KDV hariç {formatTL(shown.quote.subtotalKurus)}</div>
              </div>
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-brand">Fiyat dökümü</summary>
              <table className="mt-2 w-full">
                <tbody>
                  {shown.quote.lines.map((l) => (
                    <tr key={l.code + l.label} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2 text-slate-700">{l.label}</td>
                      <td className="py-1.5 text-right font-medium whitespace-nowrap">{formatTL(l.amountKurus)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1.5 pr-2 text-slate-700">KDV</td>
                    <td className="py-1.5 text-right font-medium whitespace-nowrap">{formatTL(shown.quote.vatKurus)}</td>
                  </tr>
                </tbody>
              </table>
            </details>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={APP_URL} data-testid="order-cta" className="flex-1 rounded-xl bg-brand px-5 py-3 text-center font-bold text-white hover:bg-brand-dark">
                Bu fiyatla sipariş ver
              </a>
              {wa ? (
                <a href={wa} className="flex-1 rounded-xl border border-emerald-600 px-5 py-3 text-center font-bold text-emerald-700 hover:bg-emerald-50">
                  WhatsApp&apos;tan yaz
                </a>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Fiyat şu anki saate göre hesaplandı; gece ve resmi tatillerde ek ücret uygulanır. Alışta 15 dakikayı aşan bekleme teslimatta eklenir.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
