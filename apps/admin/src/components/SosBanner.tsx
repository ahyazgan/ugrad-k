"use client";

import { ageLabel, INCIDENT_KINDS } from "@yazgan/shared";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button, ErrorText, Input } from "@/components/ui";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

/** Açık acil durum alarmları: her sayfanın üstünde, canlı (Realtime + 30 sn yedek okuma) */
export function SosBanner() {
  const { data, reload } = useLoad(() => repo.listIncidents({ openOnly: true, limit: 10 }));
  const [closing, setClosing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => repo.subscribeIncidents(reload), [reload]);
  useEffect(() => {
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [reload]);

  if (!data?.length) return null;

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      setClosing(null);
      setNote("");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız");
    }
  }

  return (
    <div className="mb-4 space-y-2" data-testid="sos-banner">
      {data.map((i) => (
        <div key={i.id} className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm text-red-950" role="alert">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <b className="text-red-800">🚨 ACİL DURUM — {i.courierName ?? "Kurye"}</b>
            <span className="font-semibold">{INCIDENT_KINDS[i.kind]}</span>
            <span className="text-red-800">{ageLabel(i.createdAt)}</span>
            {i.acknowledgedAt ? (
              <span className="text-xs font-semibold text-emerald-800">görüldü</span>
            ) : (
              <span className="text-xs font-semibold">{i.alertCount} uyarı gönderildi</span>
            )}
          </div>
          {i.note ? <div className="mt-1">&ldquo;{i.note}&rdquo;</div> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {i.lat != null && i.lng != null ? (
              <a
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 font-semibold text-red-800 hover:bg-red-100"
                href={`https://maps.google.com/?q=${i.lat},${i.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Konumu aç{i.accuracyM ? ` (±${Math.round(i.accuracyM)} m)` : ""}
              </a>
            ) : (
              <span className="text-xs">Konum alınamadı</span>
            )}
            {i.courierPhone ? (
              <a className="rounded-lg border border-red-300 bg-white px-3 py-1.5 font-semibold text-red-800 hover:bg-red-100" href={`tel:${i.courierPhone}`}>
                Kuryeyi ara
              </a>
            ) : null}
            {i.orderId ? (
              <Link className="font-semibold text-red-800 underline" href={`/siparisler/${i.orderId}`}>
                {i.orderNo ?? "Elindeki iş"}
              </Link>
            ) : null}
            {!i.acknowledgedAt ? (
              <Button variant="danger" onClick={() => run(() => repo.acknowledgeIncident(i.id))} data-testid={`sos-ack-${i.id}`}>
                Gördüm
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setClosing(closing === i.id ? null : i.id)} data-testid={`sos-close-${i.id}`}>
              Kapat…
            </Button>
          </div>
          {closing === i.id ? (
            <form
              className="mt-2 flex flex-wrap items-end gap-2"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                run(() => repo.resolveIncident(i.id, note));
              }}
            >
              <div className="min-w-64 flex-1">
                <Input label="Ne yapıldı? (kayıt için)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="sos-resolution" />
              </div>
              <Button type="submit" disabled={note.trim().length < 3}>
                Kaydet ve kapat
              </Button>
            </form>
          ) : null}
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
