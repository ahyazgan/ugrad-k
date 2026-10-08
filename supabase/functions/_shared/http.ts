import { MapsError, PricingError, ValidationError } from "../../../packages/shared/index.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly field?: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Ortak sarmalayıcı: CORS, JSON gövde, hata → Türkçe mesajlı JSON. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, field: e.field }, e.status);
      if (e instanceof ValidationError || e instanceof PricingError) {
        return json({ error: e.message, field: (e as ValidationError).field }, 400);
      }
      if (e instanceof MapsError) {
        console.error("maps", e.message);
        return json({ error: "Adres/mesafe servisine ulaşılamadı, lütfen tekrar deneyin" }, 502);
      }
      console.error(e);
      return json({ error: "Beklenmeyen bir hata oluştu" }, 500);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  if (req.method !== "POST") throw new HttpError(405, "Yalnızca POST desteklenir");
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Geçersiz JSON");
  }
}
