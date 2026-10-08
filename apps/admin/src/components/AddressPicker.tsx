"use client";

import type { PlaceSuggestion } from "@yazgan/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { repo, type OrderRequestInput, type PhoneCustomer } from "@/lib/repo";
import { Input } from "./ui";

export type PickedPoint = OrderRequestInput["pickup"];

/** Adres arama (Google Places, sunucu üzerinden) + müşterinin son adresleri */
export function AddressPicker({
  label,
  value,
  onChange,
  recent = [],
  testId,
}: {
  label: string;
  value: PickedPoint | null;
  onChange: (p: PickedPoint | null) => void;
  recent?: PhoneCustomer["recentAddresses"];
  testId: string;
}) {
  const sessionToken = useMemo(() => crypto.randomUUID(), []);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 3) return;
    timer.current = setTimeout(() => {
      repo.searchPlaces(query, sessionToken).then(
        (r) => {
          setItems(r);
          setError(null);
        },
        (e: unknown) => setError(e instanceof Error ? e.message : "Adres aranamadı"),
      );
    }, 300);
  }, [query, sessionToken]);

  async function pick(s: PlaceSuggestion) {
    try {
      const d = await repo.placeDetails(s.placeId, sessionToken);
      onChange({ address: d.address, lat: d.lat, lng: d.lng, district: d.district, details: value?.details });
      setQuery("");
      setItems([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Adres alınamadı");
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-700">{label}</div>
      {value ? (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
          <span data-testid={`${testId}-selected`}>{value.address}</span>
          <button type="button" className="text-xs text-brand underline" onClick={() => onChange(null)}>
            Değiştir
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input placeholder="Adres veya işyeri ara…" value={query} onChange={(e) => setQuery(e.target.value)} data-testid={`${testId}-search`} />
          {items.length > 0 && query.trim().length >= 3 ? (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-white shadow-lg">
              {items.map((s, i) => (
                <li key={s.placeId}>
                  <button
                    type="button"
                    data-testid={`${testId}-suggestion-${i}`}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-canvas"
                    onClick={() => pick(s)}
                  >
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs text-muted">{s.subtitle}</div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {recent.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recent.map((r) => (
                <button
                  key={r.address}
                  type="button"
                  className="rounded-full border border-line px-2.5 py-1 text-xs hover:bg-canvas"
                  onClick={() =>
                    onChange({
                      address: r.address,
                      lat: r.lat,
                      lng: r.lng,
                      details: r.details ?? undefined,
                      contactName: r.contactName ?? undefined,
                      contactPhone: r.contactPhone ?? undefined,
                    })
                  }
                >
                  ↺ {r.address.length > 40 ? `${r.address.slice(0, 40)}…` : r.address}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
