// Netgsm SMS gönderimi (REST v2). Kimlik bilgileri Supabase secrets'tan gelir:
//   NETGSM_USERCODE, NETGSM_PASSWORD, NETGSM_HEADER (onaylı gönderici başlığı)
// NETGSM_USERCODE yoksa SMS gönderilmez, yalnızca loglanır (geliştirme modu).

export interface SmsResult {
  sent: boolean;
  jobId?: string;
  dryRun?: boolean;
}

/** "+90 532 123 45 67", "905321234567", "05321234567" → "5321234567" */
export function normalizeTrMobile(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.replace(/^(90|0)/, "");
  if (!/^5\d{9}$/.test(local)) throw new Error(`Geçersiz cep telefonu: ${phone}`);
  return local;
}

export async function sendSms(
  phone: string,
  message: string,
  opts: { env?: (k: string) => string | undefined; fetchFn?: typeof fetch } = {},
): Promise<SmsResult> {
  const env = opts.env ?? ((k: string) => Deno.env.get(k));
  const fetchFn = opts.fetchFn ?? fetch;
  const no = normalizeTrMobile(phone);
  const user = env("NETGSM_USERCODE");
  const pass = env("NETGSM_PASSWORD");
  const header = env("NETGSM_HEADER");

  if (!user || !pass || !header) {
    console.warn(`[SMS deneme modu] ${no}: ${message}`);
    return { sent: false, dryRun: true };
  }

  const res = await fetchFn("https://api.netgsm.com.tr/sms/rest/v2/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${user}:${pass}`)}`,
    },
    body: JSON.stringify({
      msgheader: header,
      encoding: "TR",
      messages: [{ msg: message, no }],
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { code?: string; jobid?: string; description?: string };
  // Netgsm başarı kodu "00"
  if (!res.ok || body.code !== "00") {
    throw new Error(`Netgsm hata: HTTP ${res.status} kod=${body.code} ${body.description ?? ""}`);
  }
  return { sent: true, jobId: body.jobid };
}
