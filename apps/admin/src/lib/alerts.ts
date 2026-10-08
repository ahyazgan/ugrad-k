"use client";

import { repo } from "@/lib/repo";

/** Counters shown as badges in the sidebar (derived from existing repo calls). */
export interface NavCounts {
  /** Orders waiting for a courier (beklemede + onaylandi) */
  unassigned: number;
  /** New website leads + new courier applications */
  newApplications: number;
  /** Assistant conversations waiting for a human */
  handoff: number;
  /** Invoices the provider rejected */
  failedInvoices: number;
}

const ZERO: NavCounts = { unassigned: 0, newApplications: 0, handoff: 0, failedInvoices: 0 };
const MAX_AGE_MS = 30_000;
let cache: { at: number; value: Promise<NavCounts> } | null = null;

async function fetchCounts(): Promise<NavCounts> {
  const [orders, leads, apps, conversations, invoices] = await Promise.allSettled([
    repo.listOrders({ statuses: ["beklemede", "onaylandi"], limit: 200 }),
    repo.listLeads(),
    repo.listCourierApplications(),
    repo.listConversations(),
    repo.listInvoices(),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  return {
    ...ZERO,
    unassigned: ok(orders)?.length ?? 0,
    newApplications: (ok(leads)?.filter((l) => l.status === "yeni").length ?? 0) + (ok(apps)?.filter((a) => a.status === "yeni").length ?? 0),
    handoff: ok(conversations)?.filter((c) => c.status === "handoff").length ?? 0,
    failedInvoices: ok(invoices)?.filter((i) => i.status === "failed").length ?? 0,
  };
}

/**
 * Light, throttled loader: navigation and the 60 s timer both call this,
 * but the repo is hit at most once per 30 s unless `force` is set.
 */
export function loadNavCounts(force = false): Promise<NavCounts> {
  if (!force && cache && Date.now() - cache.at < MAX_AGE_MS) return cache.value;
  const value = fetchCounts().catch(() => ZERO);
  cache = { at: Date.now(), value };
  return value;
}
