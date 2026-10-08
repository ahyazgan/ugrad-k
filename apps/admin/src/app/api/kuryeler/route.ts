// Kurye hesabı oluşturma: auth kullanıcısı (telefon) + profil rolü + kurye kaydı.
// Service role anahtarı yalnızca sunucuda kullanılır (SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC değil).
import { createClient } from "@supabase/supabase-js";

const json = (data: unknown, status = 200) => Response.json(data, { status });

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return json({ error: "Sunucu yapılandırılmamış (SUPABASE_SERVICE_ROLE_KEY)" }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Çağıranın yönetici olduğunu doğrula
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Giriş gerekli" }, 401);
  const { data: caller } = await admin.auth.getUser(token);
  if (!caller.user) return json({ error: "Oturum geçersiz" }, 401);
  const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", caller.user.id).single();
  if (callerProfile?.role !== "admin") return json({ error: "Yetkiniz yok" }, 403);

  const body = (await request.json().catch(() => null)) as {
    fullName?: string;
    phone?: string;
    plate?: string;
    vehicleModel?: string;
  } | null;
  const fullName = body?.fullName?.trim();
  const plate = body?.plate?.trim().toUpperCase();
  const digits = (body?.phone ?? "").replace(/\D/g, "").replace(/^(90|0)/, "");
  if (!fullName || !plate) return json({ error: "Ad soyad ve plaka zorunlu" }, 400);
  if (!/^5\d{9}$/.test(digits)) return json({ error: "Geçerli bir cep telefonu girin" }, 400);
  const phone = `90${digits}`;

  // Kullanıcı varsa (ör. daha önce müşteri olarak kaydolduysa) onu kuryeye çevir
  let userId: string | null = null;
  const { data: existing } = await admin.from("profiles").select("id").in("phone", [phone, `+${phone}`]).maybeSingle();
  if (existing) {
    userId = existing.id;
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      phone,
      phone_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !created.user) return json({ error: `Kullanıcı oluşturulamadı: ${error?.message}` }, 400);
    userId = created.user.id;
  }

  const { error: pErr } = await admin.from("profiles").update({ role: "kurye", full_name: fullName }).eq("id", userId);
  if (pErr) return json({ error: `Profil güncellenemedi: ${pErr.message}` }, 500);
  const { error: cErr } = await admin
    .from("couriers")
    .upsert({ id: userId, plate, vehicle_model: body?.vehicleModel?.trim() || null, active: true });
  if (cErr) return json({ error: `Kurye kaydı oluşturulamadı: ${cErr.message}` }, 500);

  return json({ id: userId }, 201);
}
