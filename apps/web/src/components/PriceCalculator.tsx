"use client";

import { formatTL, type PlaceDetails, type PlaceSuggestion, type PricingSettings, type ServiceLevel } from "@yazgan/shared";
import { useEffect, useId, useRef, useState } from "react";
import { Sticker } from "@/components/Sticker";
import { HandNote } from "@/components/ui";
import { placeDetails, quote, searchPlaces, SiteApiError, type SiteQuote } from "@/lib/api";
import { baseRows, economyWindowText } from "@/lib/pricing-info";
import { APP_URL, whatsappLink } from "@/lib/site";

/** Visible keyboard focus: text fields keep the ink border and get an offset ring. */
const FIELD_FOCUS = "outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2";
/** Visually hidden radio/checkbox inside a label: draw the ring on the label instead. */
const CONTROL_FOCUS = "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/60 has-[:focus-visible]:ring-offset-2";

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
        className={`w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base ${FIELD_FOCUS}`}
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
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${CONTROL_FOCUS} ${checked ? "border-brand bg-brand-light" : "border-slate-200 bg-white"}`}
    >
      <input type="checkbox" data-testid={id} className="mt-0.5 h-4 w-4 accent-[#111114] focus-visible:outline-none" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-semibold text-slate-900">{label}</span>
        <span className="text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

const LEVELS: Array<{ value: ServiceLevel; label: string; hint: string }> = [
  { value: "ekonomi", label: "Ekonomi", hint: "Gün içinde, indirimli" },
  { value: "standart", label: "Standart", hint: "En kısa sürede" },
  { value: "acil", label: "Acil", hint: "60 dakikada teslim" },
];

function LevelPicker({ value, onChange }: { value: ServiceLevel; onChange: (v: ServiceLevel) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-slate-900">Hizmet</legend>
      <div className="grid grid-cols-3 gap-2" role="radiogroup">
        {LEVELS.map((l) => (
          <label
            key={l.value}
            className={`cursor-pointer rounded-xl border p-2.5 text-center text-sm ${CONTROL_FOCUS} ${value === l.value ? "border-brand bg-brand-light" : "border-slate-200 bg-white"}`}
          >
            <input
              type="radio"
              name="service-level"
              data-testid={`level-${l.value}`}
              className="sr-only"
              checked={value === l.value}
              onChange={() => onChange(l.value)}
            />
            <span className="block font-semibold text-slate-900">{l.label}</span>
            <span className="text-xs text-slate-500">{l.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Empty state before both addresses are picked: a dashed "receipt preview" listing the opening fee and
 * km tiers of the current tariff, with the total left blank ("— TL").
 */
function ReceiptPreview({ settings, stickerClassName = "" }: { settings: PricingSettings; stickerClassName?: string }) {
  const rows = baseRows(settings);
  return (
    <div className="relative rounded-2xl border-2 border-dashed border-slate-300 bg-neo-bg/40 px-4 pt-4 pb-3" data-testid="receipt-preview">
      <Sticker name="fis" className={`absolute -top-6 -right-3 w-16 rotate-6 ${stickerClassName}`} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pr-12">
        <span className="text-xs font-extrabold tracking-[0.14em] text-neo-muted uppercase">Fiş önizlemesi</span>
        <HandNote variant="ink" className="-rotate-2 text-xl">
          adresi yaz, kalemleri gör
        </HandNote>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex items-baseline gap-2">
            <span className="text-slate-700">{r.label}</span>
            <span aria-hidden="true" className="min-w-4 flex-1 -translate-y-[3px] border-b border-dotted border-slate-400" />
            <span className="font-semibold whitespace-nowrap text-brand">{r.value}</span>
          </li>
        ))}
        <li className="flex items-baseline gap-2 text-slate-500">
          <span>Hizmet ve zaman ekleri</span>
          <span aria-hidden="true" className="min-w-4 flex-1 -translate-y-[3px] border-b border-dotted border-slate-300" />
          <span className="whitespace-nowrap">adrese göre</span>
        </li>
      </ul>
      <div className="mt-3 flex items-baseline justify-between border-t-2 border-dashed border-slate-300 pt-3">
        <span className="font-black text-brand">Toplam</span>
        <span className="text-2xl font-black text-slate-400">
          <span aria-hidden="true">— TL</span>
          <span className="sr-only">henüz hesaplanmadı</span>
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">Tutarlar KDV hariçtir. İki adresi seçin, fiyat anında hesaplansın.</p>
    </div>
  );
}

/**
 * Adres → anında fiyat. Sunucuda uygulama ile aynı fiyat fonksiyonu (pricing.ts) çalışır.
 * `settings` is the live tariff read on the server (getPricingSettings); it only drives the copy here,
 * the quote itself is always recomputed server-side.
 */
export function PriceCalculator({
  settings,
  compact = false,
  receiptStickerClassName,
}: {
  settings: PricingSettings;
  compact?: boolean;
  receiptStickerClassName?: string;
}) {
  const [pickup, setPickup] = useState<PlaceDetails | null>(null);
  const [dropoff, setDropoff] = useState<PlaceDetails | null>(null);
  const [serviceLevel, setServiceLevel] = useState<ServiceLevel>("standart");
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
    quote({ pickup, dropoff, serviceLevel, roundTrip, largePackage }).then(
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
  }, [pickup, dropoff, serviceLevel, roundTrip, largePackage]);

  const shown = pickup && dropoff ? result : null;
  const wa = shown
    ? whatsappLink(`Merhaba, ${pickup!.address} → ${dropoff!.address} için kurye istiyorum. Hesaplanan fiyat: ${formatTL(shown.quote.totalKurus)} (KDV dahil).`)
    : null;

  return (
    <div className="scroll-mt-24 rounded-[26px] bg-white p-5 shadow-xl shadow-brand/5 sm:p-6" id="fiyat-hesapla">
      <div className="grid gap-4">
        <AddressField id="pickup" label="Nereden?" placeholder="Alış adresi, ör. Kavacık" value={pickup} onChange={setPickup} />
        <AddressField id="dropoff" label="Nereye?" placeholder="Teslim adresi, ör. Levent" value={dropoff} onChange={setDropoff} />
        <LevelPicker value={serviceLevel} onChange={setServiceLevel} />
        <div className={`grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
          <Toggle id="opt-roundtrip" label="Gidiş-dönüş" hint="İmzalatıp geri getir" checked={roundTrip} onChange={setRoundTrip} />
          <Toggle id="opt-large" label="Büyük paket" hint={`${settings.heavyThresholdKg.toLocaleString("tr-TR")} kg üzeri`} checked={largePackage} onChange={setLargePackage} />
        </div>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-5" aria-live="polite">
        {!pickup || !dropoff ? (
          <ReceiptPreview settings={settings} stickerClassName={receiptStickerClassName} />
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
              <a href={APP_URL} data-testid="order-cta" className="flex-1 rounded-full bg-accent px-5 py-3.5 text-center font-extrabold text-brand hover:bg-accent-dark">
                Bu fiyatla sipariş ver
              </a>
              {wa ? (
                <a href={wa} className="flex-1 rounded-xl border border-emerald-600 px-5 py-3 text-center font-bold text-emerald-700 hover:bg-emerald-50">
                  WhatsApp&apos;tan yaz
                </a>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Fiyat şu anki saate göre hesaplandı; gece, Pazar ve resmi tatillerde ek ücret uygulanır. Ekonomi yalnızca {economyWindowText(settings)} arası alışlarda seçilebilir. Alışta {settings.waitingFreeMinutes} dakikayı aşan bekleme teslimatta eklenir.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
