import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Kurumsal API marka alan adından sunulur: https://<site>/api/v1/... → Supabase Edge Function "api"
  async rewrites() {
    return supabaseUrl ? [{ source: "/api/v1/:path*", destination: `${supabaseUrl}/functions/v1/api/v1/:path*` }] : [];
  },
};

export default nextConfig;
