"use client";

import { createDemoRepo } from "./demo";
import { createSupabaseRepo } from "./supabase";
import type { AdminRepo } from "./types";

export * from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Supabase bilgileri yoksa panel DEMO modunda açılır. */
export const repo: AdminRepo = url && anonKey ? createSupabaseRepo(url, anonKey) : createDemoRepo();
