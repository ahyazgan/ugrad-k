// API anahtarı ve webhook gizli anahtarı üretimi. Anahtarın kendisi saklanmaz; yalnız SHA-256 özeti
// veritabanına yazılır, anahtar oluşturulduğunda kullanıcıya bir kez gösterilir.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomString(length: number): string {
  // Modülo sapması olmasın diye 62*4=248 üzerindeki baytlar atılır
  const out: string[] = [];
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < 248 && out.length < length) out.push(ALPHABET[b % 62]!);
    }
  }
  return out.join("");
}

export const generateApiKey = () => `yk_live_${randomString(32)}`;
export const generateWebhookSecret = () => `whsec_${randomString(32)}`;
/** Listede gösterilen ayırt edici kısım */
export const keyPrefix = (key: string) => key.slice(0, 12);

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
