import { createDemoApi } from "./demo";
import { createSupabaseApi } from "./supabase";
import type { Api } from "./types";

export * from "./types";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Supabase bilgileri yoksa uygulama DEMO modunda açılır. */
export const api: Api = url && anonKey ? createSupabaseApi(url, anonKey) : createDemoApi();
