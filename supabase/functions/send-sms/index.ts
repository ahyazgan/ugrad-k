// Supabase Auth "Send SMS Hook": doğrulama kodlarını Netgsm ile gönderir.
// Kurulum: Supabase panel → Authentication → Hooks → Send SMS → HTTPS → bu fonksiyonun URL'i.
// Üretilen gizli anahtarı SEND_SMS_HOOK_SECRETS olarak secrets'a ekleyin ("v1,whsec_...").
import { Webhook } from "npm:standardwebhooks@1.0.0";
import { sendSms } from "../_shared/netgsm.ts";

Deno.serve(async (req) => {
  const payload = await req.text();
  const secret = (Deno.env.get("SEND_SMS_HOOK_SECRETS") ?? "").replace("v1,whsec_", "");
  if (!secret) {
    return Response.json({ error: { http_code: 500, message: "SMS hook yapılandırılmamış" } }, { status: 500 });
  }
  let data: { user: { phone: string }; sms: { otp: string } };
  try {
    data = new Webhook(secret).verify(payload, Object.fromEntries(req.headers)) as typeof data;
  } catch {
    return Response.json({ error: { http_code: 401, message: "İmza geçersiz" } }, { status: 401 });
  }
  try {
    await sendSms(data.user.phone, `Yazgan Kurye doğrulama kodunuz: ${data.sms.otp}. Kimseyle paylaşmayın.`);
    return Response.json({});
  } catch (e) {
    console.error(e);
    return Response.json({ error: { http_code: 500, message: "SMS gönderilemedi" } }, { status: 500 });
  }
});
