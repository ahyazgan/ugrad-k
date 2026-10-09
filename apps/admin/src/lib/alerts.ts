"use client";

import { repo, type NavCounts } from "@/lib/repo";

export type { NavCounts };

const ZERO: NavCounts = { unassigned: 0, newApplications: 0, handoff: 0, failedInvoices: 0 };
const MAX_AGE_MS = 30_000;
let cache: { at: number; value: Promise<NavCounts> } | null = null;

/**
 * Sidebar badge counters. The repo counts on the server (HEAD + count=exact),
 * so the numbers are not capped by list limits and no rows are transferred.
 * Navigation and the 60 s timer both call this; the repo is hit at most once
 * per 30 s unless `force` is set.
 */
export function loadNavCounts(force = false): Promise<NavCounts> {
  if (!force && cache && Date.now() - cache.at < MAX_AGE_MS) return cache.value;
  const entry: { at: number; value: Promise<NavCounts> } = {
    at: Date.now(),
    value: repo.navCounts().catch(() => {
      // Do not serve a failed result for 30 s; the next call retries
      if (cache === entry) cache = null;
      return ZERO;
    }),
  };
  cache = entry;
  return entry.value;
}
