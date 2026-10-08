// Yöneticiye kısa uyarı (WhatsApp şablonu "yonetici_uyari", olmazsa SMS). ADMIN_ALERT_PHONES'a gider.
import { deliver, type Env } from "./channels.ts";
import { notificationConfig } from "./dispatch.ts";

export async function alertAdmins(title: string, text: string, deps: { env: Env; fetchFn?: typeof fetch }) {
  const cfg = notificationConfig(deps.env);
  return await Promise.all(
    cfg.adminPhones.map((phone) =>
      deliver(
        {
          to: { role: "admin", phone },
          channels: ["whatsapp", "sms"],
          title,
          text,
          // Şablon parametresi tek satır ve kısa olmalı
          whatsappTemplate: { name: "yonetici_uyari", params: [text.replace(/\s+/g, " ").slice(0, 200)] },
        },
        deps,
      ),
    ),
  );
}
