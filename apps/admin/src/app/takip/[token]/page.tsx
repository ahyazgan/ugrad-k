"use client";

import { BRAND, COMPANY, ORDER_STATUS_LABELS, type OrderStatus } from "@yazgan/shared";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LeafletMap, type MapPin } from "@/components/LeafletMap";
import { RatingForm } from "@/components/RatingForm";
import { fmtTime } from "@/lib/dates";
import { fetchTracking, type Tracking } from "@/lib/tracking";

const STEPS: OrderStatus[] = ["beklemede", "onaylandi", "kuryeye_atandi", "alindi", "yolda", "teslim_edildi"];
const POLL_MS = 15_000;


const district = (a: string) => a.split(",").slice(-1)[0]!.trim().replace(/\/İstanbul$/i, "");

export default function TakipPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Tracking | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchTracking(token).then(
        (t) => alive && (setData(t), setError(null)),
        (e: unknown) => alive && setError(e instanceof Error ? e.message : "Hata"),
      );
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [token]);

  const loc = data?.courier_location ?? null;
  const pins = useMemo<MapPin[]>(
    () =>
      data
        ? [
            { id: "teslim", lat: data.dropoff_lat, lng: data.dropoff_lng, label: "T", color: "#047857" },
            ...(loc ? [{ id: "kurye", lat: loc.lat, lng: loc.lng, label: "🛵", color: "#f59e0b", size: 32, front: true }] : []),
          ]
        : [],
    [data, loc],
  );

  if (data === undefined && !error) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Yükleniyor…</div>;
  }
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-brand">Gönderi bulunamadı</h1>
          <p className="mt-2 text-slate-500">{error ?? "Takip bağlantısı geçersiz veya süresi dolmuş."}</p>
        </div>
      </div>
    );
  }

  const reached = new Map(data.history.map((h) => [h.status, h.at]));
  const closed = data.status === "teslim_edildi" || data.status === "iptal";

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-slate-50">
      <header className="bg-brand px-4 py-4 text-white">
        <div className="text-lg font-extrabold">{BRAND.name}</div>
        <div className="text-sm text-white/80">Gönderi takibi · {data.order_no}</div>
      </header>
      <main className="space-y-4 p-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-2xl font-bold text-slate-900">{ORDER_STATUS_LABELS[data.status]}</div>
          {data.status === "yolda" && data.courier_first_name ? (
            <p className="mt-1 text-slate-600">Kuryemiz {data.courier_first_name} gönderinizi getiriyor.</p>
          ) : null}
          {data.status === "teslim_edildi" ? (
            <p className="mt-1 text-emerald-700">Teslim saati: {fmtTime(data.delivered_at)}</p>
          ) : null}
          <p className="mt-2 text-sm text-slate-500">
            {district(data.pickup_address)} → {district(data.dropoff_address)}
            {data.urgent ? " · Acil" : ""}
          </p>
        </section>

        {!closed ? (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {/* Kurye ilk kez görününce görünüm ikisini de kapsayacak şekilde yeniden sığdırılır */}
            <LeafletMap className="h-72 w-full" pins={pins} fitKey={loc ? "kurye" : "teslim"} />
            <p className="px-4 py-2 text-xs text-slate-500">
              {loc ? `🛵 Kurye konumu · son güncelleme ${fmtTime(loc.recorded_at)}` : "T: teslim noktası"} · sayfa 15 sn&apos;de bir yenilenir
            </p>
          </section>
        ) : null}

        {data.status === "teslim_edildi" && (data.can_rate || data.rating) ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <RatingForm token={token} initial={data.rating ?? null} />
          </section>
        ) : null}

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <ol className="space-y-3">
            {(data.status === "iptal" ? [...STEPS.filter((s) => reached.has(s)), "iptal" as const] : STEPS).map((s) => {
              const at = reached.get(s);
              const current = s === data.status;
              return (
                <li key={s} className="flex items-center gap-3">
                  <span
                    className={`h-3.5 w-3.5 rounded-full ${at ? (current ? "bg-accent" : "bg-brand") : "bg-slate-200"}`}
                  />
                  <span className={`flex-1 ${current ? "font-bold" : at ? "" : "text-slate-400"}`}>{ORDER_STATUS_LABELS[s]}</span>
                  <span className="text-sm text-slate-500">{at ? fmtTime(at) : ""}</span>
                </li>
              );
            })}
          </ol>
        </section>
        <p className="pb-6 text-center text-xs text-slate-400">
          Konum bilgisi yalnızca teslimat süresince gösterilir. · {COMPANY.title}
        </p>
      </main>
    </div>
  );
}
