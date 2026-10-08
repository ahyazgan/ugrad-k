// iyzico Checkout Form (ortak ödeme sayfası) istemcisi — IYZWSv2 imzalama.
// Ortam değişkenleri: IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_BASE_URL
//   (test: https://sandbox-api.iyzipay.com, canlı: https://api.iyzipay.com)
// NOT: Sandbox hesabıyla uçtan uca doğrulanmalıdır (docs/kurulum.md).

export interface IyzicoConfig {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
}

export class IyzicoError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return toHex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)));
}

/** IYZWSv2: base64("apiKey:..&randomKey:..&signature:" + HMAC(secret, rnd + path + body)) */
export async function authorizationHeader(cfg: IyzicoConfig, path: string, body: string, randomKey: string) {
  const signature = await hmacSha256Hex(cfg.secretKey, randomKey + path + body);
  return `IYZWSv2 ${btoa(`apiKey:${cfg.apiKey}&randomKey:${randomKey}&signature:${signature}`)}`;
}

/** Kuruş → iyzico fiyat metni ("1234.5" biçimi, gereksiz sıfırsız) */
export const iyzicoPrice = (kurus: number) => {
  const s = (kurus / 100).toFixed(2);
  return s.replace(/\.?0+$/, "") || "0";
};

export function iyzicoFromEnv(env: (k: string) => string | undefined): IyzicoConfig | null {
  const apiKey = env("IYZICO_API_KEY");
  const secretKey = env("IYZICO_SECRET_KEY");
  if (!apiKey || !secretKey) return null;
  return { apiKey, secretKey, baseUrl: env("IYZICO_BASE_URL") ?? "https://sandbox-api.iyzipay.com" };
}

async function call<T>(cfg: IyzicoConfig, path: string, payload: unknown, fetchFn: typeof fetch = fetch): Promise<T> {
  const body = JSON.stringify(payload);
  const rnd = `${Date.now()}${Math.floor(Math.random() * 1e9)}`;
  const res = await fetchFn(cfg.baseUrl + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: await authorizationHeader(cfg, path, body, rnd),
      "x-iyzi-rnd": rnd,
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as T & { status?: string; errorMessage?: string; errorCode?: string };
  if (!res.ok || json.status !== "success") {
    throw new IyzicoError(json.errorMessage ?? `iyzico HTTP ${res.status}`, json.errorCode);
  }
  return json;
}

export interface CheckoutBuyer {
  id: string;
  name: string;
  surname: string;
  gsmNumber: string;
  email: string;
  identityNumber: string;
  address: string;
  city: string;
  ip: string;
}

export interface CheckoutInit {
  orderId: string;
  orderNo: string;
  totalKurus: number;
  callbackUrl: string;
  buyer: CheckoutBuyer;
}

/** Ödeme sayfası başlat → { token, paymentPageUrl } */
export function buildCheckoutRequest(i: CheckoutInit) {
  const price = iyzicoPrice(i.totalKurus);
  const address = { contactName: `${i.buyer.name} ${i.buyer.surname}`, city: i.buyer.city, country: "Turkey", address: i.buyer.address };
  return {
    locale: "tr",
    conversationId: i.orderId,
    price,
    paidPrice: price,
    currency: "TRY",
    basketId: i.orderId,
    paymentGroup: "PRODUCT",
    callbackUrl: i.callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id: i.buyer.id,
      name: i.buyer.name,
      surname: i.buyer.surname,
      gsmNumber: i.buyer.gsmNumber,
      email: i.buyer.email,
      identityNumber: i.buyer.identityNumber,
      registrationAddress: i.buyer.address,
      ip: i.buyer.ip,
      city: i.buyer.city,
      country: "Turkey",
    },
    shippingAddress: address,
    billingAddress: address,
    basketItems: [
      { id: i.orderId, name: `Kurye hizmeti ${i.orderNo}`, category1: "Kurye", itemType: "VIRTUAL", price },
    ],
  };
}

export function initializeCheckout(cfg: IyzicoConfig, i: CheckoutInit, fetchFn?: typeof fetch) {
  return call<{ token: string; paymentPageUrl: string; tokenExpireTime: number }>(
    cfg,
    "/payment/iyzipos/checkoutform/initialize/auth/ecom",
    buildCheckoutRequest(i),
    fetchFn,
  );
}

export interface CheckoutResult {
  paymentStatus: string; // "SUCCESS" | "FAILURE" | "INIT_THREEDS" ...
  paymentId: string;
  paidPrice: number;
  basketId: string;
  conversationId: string;
}

export function retrieveCheckout(cfg: IyzicoConfig, token: string, fetchFn?: typeof fetch) {
  return call<CheckoutResult>(cfg, "/payment/iyzipos/checkoutform/auth/ecom/detail", { locale: "tr", token }, fetchFn);
}

/** Aynı gün iptal (tam tutar). Gün geçmişse iyzico iade (refund) gerekir. */
export function cancelPayment(cfg: IyzicoConfig, paymentId: string, ip: string, fetchFn?: typeof fetch) {
  return call<{ paymentId: string; price: number }>(cfg, "/payment/cancel", { locale: "tr", paymentId, ip }, fetchFn);
}
