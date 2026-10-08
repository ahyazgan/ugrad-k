"use client";

import { createClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@yazgan/shared";

export interface Tracking {
  order_no: string;
  status: OrderStatus;
  urgent: boolean;
  pickup_address: string;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  created_at: string;
  picked_up_at: string | null;
  delivered_at: string | null;
  courier_first_name: string | null;
  courier_location: { lat: number; lng: number; recorded_at: string } | null;
  history: Array<{ status: OrderStatus; at: string }>;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const client = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

/** Herkese açık takip verisi (get_tracking RPC). Supabase yoksa demo veri. */
export async function fetchTracking(token: string): Promise<Tracking | null> {
  if (client) {
    const { data, error } = await client.rpc("get_tracking", { p_token: token });
    if (error) throw new Error("Takip bilgisi alınamadı");
    return (data as Tracking | null) ?? null;
  }
  if (!token.startsWith("demo")) return null;
  const t0 = Date.now() - 25 * 60_000;
  const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
  return {
    order_no: "YK-1001",
    status: "yolda",
    urgent: true,
    pickup_address: "Kılıçlı Mah. Şile Cad. No: 8A, Beykoz/İstanbul",
    dropoff_address: "Levent Mah., Büyükdere Cad., Beşiktaş/İstanbul",
    dropoff_lat: 41.0819,
    dropoff_lng: 29.0106,
    created_at: at(0),
    picked_up_at: at(12),
    delivered_at: null,
    courier_first_name: "Mehmet",
    courier_location: { lat: 41.0905, lng: 29.0561, recorded_at: new Date(Date.now() - 40_000).toISOString() },
    history: [
      { status: "beklemede", at: at(0) },
      { status: "onaylandi", at: at(2) },
      { status: "kuryeye_atandi", at: at(3) },
      { status: "alindi", at: at(12) },
      { status: "yolda", at: at(13) },
    ],
  };
}
