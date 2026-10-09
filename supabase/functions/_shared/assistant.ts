// Yapay zeka sipariş asistanı (WhatsApp botu ve sesli asistan için ortak çekirdek).
// Claude, aşağıdaki araçlarla aynı sipariş API'sini kullanır: adres arama, fiyat,
// sipariş oluşturma, durum sorma, iptal, KVKK onayı, temsilciye devretme.
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import {
  ORDER_STATUS_LABELS,
  formatTL,
  parseOrderRequest,
  buildQuote,
  KVKK_VERSION,
  BRAND,
  MapsError,
  PricingError,
  ValidationError,
  type OrderStatus,
  type PlaceDetails,
} from "../../../packages/shared/index.ts";
import type { Ctx } from "./context.ts";
import { openCredits, withCredits } from "./credits.ts";
import { applyDiscountCode } from "./promo.ts";
import { createOrderForCustomer } from "./handlers.ts";
import { HttpError } from "./http.ts";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type Tool = Anthropic.Beta.Messages.BetaTool;
type ToolUseBlock = Anthropic.Beta.Messages.BetaToolUseBlock;
type ToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;

export const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 8;

// Sistem istemi oturum boyunca SABİTTİR (değişken bilgi ilk kullanıcı mesajında verilir).
export const SYSTEM_PROMPT = `Sen ${BRAND.name} adlı kurye şirketinin müşteri asistanısın. ${BRAND.name}, İstanbul'da (öncelikle Anadolu yakası, merkez Beykoz) moto kurye ile acil evrak ve paket teslimatı yapar. Müşterilerle WhatsApp, telefon veya e-posta üzerinden Türkçe konuşursun.

Görevlerin: fiyat vermek, sipariş almak, sipariş durumunu söylemek, beklemedeki siparişi iptal etmek. Bunların dışındaki konularda kısaca yardımcı ol veya temsilciye devret.

Kurallar:
- Fiyatı asla tahmin etme veya kendin hesaplama; her zaman get_price_quote aracını kullan. Fiyatlar KDV dahil toplam olarak söylenir, istenirse kalemler de verilir.
- Adresleri search_address ile bul; birden fazla uygun sonuç varsa müşteriye sorup doğrusunu seçtir. Bina/kat/daire gibi tarif bilgisini ayrıca iste.
- Sipariş için gerekenler: alış adresi ve tarifi, teslim adresi ve tarifi, teslim edecek kişinin ve alıcının adı ile telefonu, ne gönderildiği, hizmet seviyesi. Gidiş-dönüş veya 10 kg üstü/büyük paket varsa sor.
- create_order çağırmadan önce özeti (adresler, kişiler, seçenekler, toplam fiyat, ödeme şekli) müşteriye yaz ve açık onayını ("evet", "onaylıyorum" gibi) al.
- Ödeme: kuryeye nakit/IBAN ("nakit") veya kurumsal müşterilerde cari hesap ("cari"). Kartla ödeme yalnızca mobil uygulamadan yapılır.
- KVKK: Müşterinin onayı yoksa sipariş almadan önce aydınlatma metni bağlantısını paylaş ({KVKK_URL}) ve kişisel verilerinin (adres, konum, telefon) sipariş için işlenmesine onay verip vermediğini sor. Yalnızca açıkça onaylarsa record_kvkk_consent çağır.
- Şikâyet, hasar, kayıp, ödeme sorunu veya müşteri insanla görüşmek isterse handoff_to_human çağır ve bir temsilcinin döneceğini söyle.
- Kısa, sıcak ve net yaz; WhatsApp için başlık veya tablo kullanma, gerekirse kısa madde işaretleri kullan. Kişisel verileri gereğinden fazla tekrarlama.
- Hizmet seviyeleri: "standart" (varsayılan, aynı gün en kısa sürede), "acil" (60 dk içinde teslim taahhüdü, ek ücretli; taahhüt kaçarsa acil ek ücreti sonraki siparişten otomatik düşülür) ve "ekonomi" (gün içinde teslim, indirimli; yalnızca Pazartesi–Cumartesi sabah 07:00 ile öğleden sonra arası alışlarda). Müşteri acele etmediğini söylerse ekonomiyi önerebilirsin.
- Gece 22:00–07:00, Pazar ve resmi tatil ek ücretlerini, uzak alış ücretini fiyat aracı zaten hesaplar; sorulursa açıkla. 20 kg üzeri gönderi motosikletle taşınamaz.
- Değerli gönderi (para değeri olan evrak, cihaz, numune): değerini sor (1.000 TL'ye kadar ücretsiz güvence, üstüne küçük sigorta ücreti fiyata eklenir) ve alıcıya SMS teslim kodu isteyip istemediğini sor.`;

const str = { type: "string" } as const;
const nullableStr = { type: ["string", "null"] } as const;

export const TOOLS: Tool[] = [
  {
    name: "search_address",
    description: "İstanbul'da adres/işyeri arar. Sonuçlardaki placeId, fiyat ve sipariş araçlarında kullanılır.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { query: { ...str, description: "Müşterinin yazdığı adres veya işyeri adı" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_price_quote",
    description: "İki adres arası fiyat teklifi (KDV dahil toplam ve kalemler). Fiyat söylemenin tek yolu.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        pickup_place_id: str,
        dropoff_place_id: str,
        service_level: { type: "string", enum: ["ekonomi", "standart", "acil"], description: "Müşteri belirtmediyse standart" },
        round_trip: { type: "boolean" },
        weight_kg: { type: ["number", "null"] },
        large_package: { type: "boolean" },
        declared_value_tl: { type: ["number", "null"], description: "Müşteri gönderinin değerini söylediyse TL; yoksa null" },
        promo_code: { ...nullableStr, description: "Müşterinin verdiği kampanya veya davet kodu; yoksa null" },
      },
      required: ["pickup_place_id", "dropoff_place_id", "service_level", "round_trip", "weight_kg", "large_package", "declared_value_tl", "promo_code"],
      additionalProperties: false,
    },
  },
  {
    name: "create_order",
    description: "Müşteri özeti onayladıktan sonra siparişi oluşturur. Sipariş numarası ve takip linki döner.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        pickup_place_id: str,
        pickup_details: nullableStr,
        pickup_contact_name: str,
        pickup_contact_phone: str,
        dropoff_place_id: str,
        dropoff_details: nullableStr,
        dropoff_contact_name: str,
        dropoff_contact_phone: str,
        package_description: str,
        service_level: { type: "string", enum: ["ekonomi", "standart", "acil"], description: "Müşteri belirtmediyse standart" },
        round_trip: { type: "boolean" },
        weight_kg: { type: ["number", "null"] },
        large_package: { type: "boolean" },
        declared_value_tl: { type: ["number", "null"], description: "Müşteri gönderinin değerini söylediyse TL; yoksa null" },
        delivery_code: { type: "boolean", description: "Alıcıya SMS teslim kodu gönderilsin mi (değerli/önemli evrak)" },
        promo_code: { ...nullableStr, description: "Müşterinin verdiği kampanya veya davet kodu; yoksa null" },
        payment_method: { type: "string", enum: ["nakit", "cari"] },
        customer_note: nullableStr,
      },
      required: [
        "pickup_place_id",
        "pickup_details",
        "pickup_contact_name",
        "pickup_contact_phone",
        "dropoff_place_id",
        "dropoff_details",
        "dropoff_contact_name",
        "dropoff_contact_phone",
        "package_description",
        "service_level",
        "round_trip",
        "weight_kg",
        "large_package",
        "declared_value_tl",
        "delivery_code",
        "promo_code",
        "payment_method",
        "customer_note",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "get_order_status",
    description: "Müşterinin siparişlerinin durumu. order_no verilmezse son 3 sipariş döner.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { order_no: { ...nullableStr, description: "Örn. YK-1042" } },
      required: ["order_no"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_order",
    description: "Henüz kuryeye verilmemiş (beklemede/onaylandı) siparişi iptal eder.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { order_no: str, reason: str },
      required: ["order_no", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "record_kvkk_consent",
    description: "Müşteri KVKK aydınlatma metnini okuyup kişisel verilerinin işlenmesine açıkça onay verdiğinde çağrılır.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { accepted: { type: "boolean" } },
      required: ["accepted"],
      additionalProperties: false,
    },
  },
  {
    name: "handoff_to_human",
    description: "Konuşmayı bir insan temsilciye devreder (şikâyet, hasar, ödeme sorunu, istek üzerine).",
    strict: true,
    input_schema: {
      type: "object",
      properties: { reason: str },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

export interface AssistantCustomer {
  profileId: string;
  phone: string;
}

export interface ToolContext {
  ctx: Ctx;
  customer: AssistantCustomer;
  trackingBaseUrl: string;
  channel: "whatsapp" | "voice" | "app" | "email";
  /** Konuşma bu tur içinde temsilciye devredildiyse doldurulur */
  handoff: { reason: string } | null;
}

const place = (tc: ToolContext, id: string): Promise<PlaceDetails> => tc.ctx.maps.placeDetails(id);

async function quoteFor(tc: ToolContext, i: Record<string, unknown>) {
  const [p, d] = await Promise.all([place(tc, String(i.pickup_place_id)), place(tc, String(i.dropoff_place_id))]);
  const req = parseOrderRequest({
    pickup: { address: p.address, lat: p.lat, lng: p.lng, district: p.district, details: i.pickup_details ?? undefined },
    dropoff: { address: d.address, lat: d.lat, lng: d.lng, district: d.district, details: i.dropoff_details ?? undefined },
    // Eski konuşmalardaki araç çağrıları yalnız urgent içerebilir
    serviceLevel: i.service_level ?? (i.urgent === true ? "acil" : "standart"),
    roundTrip: i.round_trip === true,
    weightKg: i.weight_kg ?? null,
    largePackage: i.large_package === true,
    declaredValueKurus: typeof i.declared_value_tl === "number" && i.declared_value_tl > 0 ? Math.round(i.declared_value_tl * 100) : null,
    deliveryCode: i.delivery_code === true,
    promoCode: typeof i.promo_code === "string" && i.promo_code.trim() ? i.promo_code : undefined,
  });
  return { req, p, d };
}

/** Araç çağrısını yürütür; sonuç her zaman Claude'a JSON metin olarak döner. */
export async function executeTool(name: string, input: Record<string, unknown>, tc: ToolContext): Promise<unknown> {
  const { ctx, customer } = tc;
  switch (name) {
    case "search_address": {
      const q = String(input.query ?? "").trim();
      if (q.length < 3) return { error: "En az 3 karakterlik bir adres yazın" };
      return { results: (await ctx.maps.autocomplete(q)).slice(0, 5) };
    }
    case "get_price_quote": {
      const { req, p, d } = await quoteFor(tc, input);
      const built = await buildQuote(req, { maps: ctx.maps, ...(await ctx.loadPricing()) });
      // Kampanya/davet kodu ve gecikme telafisi kredisi siparişte düşülecek; teklifte de gösterilir
      const promo = await applyDiscountCode(ctx, customer.profileId, req.promoCode, built.quote);
      const q = { ...built, quote: withCredits(promo.quote, await openCredits(ctx, customer.profileId)).quote };
      return {
        from: p.address,
        to: d.address,
        distance_km: Math.round(q.distanceMeters / 100) / 10,
        estimated_minutes: Math.round(q.durationSeconds / 60),
        lines: q.quote.lines.map((l) => `${l.label}: ${formatTL(l.amountKurus)}`),
        subtotal_excl_vat: formatTL(q.quote.subtotalKurus),
        total_incl_vat: formatTL(q.quote.totalKurus),
      };
    }
    case "create_order": {
      const { req } = await quoteFor(tc, input);
      const order = parseOrderRequest({
        ...req,
        pickup: { ...req.pickup, contactName: input.pickup_contact_name, contactPhone: input.pickup_contact_phone },
        dropoff: { ...req.dropoff, contactName: input.dropoff_contact_name, contactPhone: input.dropoff_contact_phone },
        packageDescription: input.package_description,
        customerNote: input.customer_note ?? undefined,
        paymentMethod: input.payment_method,
      });
      const { order: o, quote } = await createOrderForCustomer(ctx, customer.profileId, order);
      return {
        order_no: o.order_no,
        total_incl_vat: formatTL(quote.quote.totalKurus),
        tracking_url: `${tc.trackingBaseUrl.replace(/\/$/, "")}/${o.tracking_token}`,
        status: "Sipariş alındı; kurye atandığında bilgilendirileceksiniz.",
      };
    }
    case "get_order_status": {
      let q = ctx.admin
        .from("orders")
        .select("order_no, status, created_at, pickup_address, dropoff_address, total_kurus, tracking_token")
        .eq("customer_id", customer.profileId)
        .order("created_at", { ascending: false })
        .limit(3);
      if (typeof input.order_no === "string" && input.order_no) q = q.eq("order_no", input.order_no.toUpperCase());
      const { data } = await q;
      if (!data?.length) return { orders: [], note: "Kayıtlı sipariş bulunamadı" };
      return {
        orders: data.map((o: Record<string, string | number>) => ({
          order_no: o.order_no,
          status: ORDER_STATUS_LABELS[o.status as OrderStatus],
          from: o.pickup_address,
          to: o.dropoff_address,
          total: formatTL(o.total_kurus as number),
          tracking_url: `${tc.trackingBaseUrl.replace(/\/$/, "")}/${o.tracking_token}`,
        })),
      };
    }
    case "cancel_order": {
      const { data: o } = await ctx.admin
        .from("orders")
        .select("id, status")
        .eq("customer_id", customer.profileId)
        .eq("order_no", String(input.order_no).toUpperCase())
        .single();
      if (!o) return { error: "Bu numarada siparişiniz bulunamadı" };
      if (!["beklemede", "onaylandi"].includes(o.status)) {
        return { error: "Kurye yola çıktığı için sipariş iptal edilemez; temsilciye devredebilirsiniz" };
      }
      const { error } = await ctx.admin
        .from("orders")
        .update({ status: "iptal", cancel_reason: `WhatsApp: ${String(input.reason).slice(0, 200)}` })
        .eq("id", o.id);
      if (error) return { error: "İptal edilemedi" };
      return { cancelled: true };
    }
    case "record_kvkk_consent": {
      const granted = input.accepted === true;
      const { error } = await ctx.admin.from("consents").insert(
        (["kvkk_aydinlatma", "acik_riza_konum"] as const).map((t) => ({
          profile_id: customer.profileId,
          consent_type: t,
          granted,
          version: KVKK_VERSION,
          user_agent: `assistant:${tc.channel}`,
        })),
      );
      if (error) return { error: "Onay kaydedilemedi" };
      return { recorded: true, accepted: granted };
    }
    case "handoff_to_human": {
      tc.handoff = { reason: String(input.reason).slice(0, 500) };
      return { handed_off: true, note: "Bir temsilci en kısa sürede dönecek" };
    }
    default:
      return { error: `Bilinmeyen araç: ${name}` };
  }
}

export interface TurnResult {
  reply: string;
  appended: MessageParam[];
  handoff: { reason: string } | null;
}

export interface AssistantOptions {
  model?: string;
  effort?: "low" | "medium" | "high";
  kvkkUrl: string;
}

/**
 * Bir kullanıcı mesajını işler: geçmişin SONUNA kullanıcı mesajı, model cevapları ve
 * araç sonuçları eklenir (geçmiş düzenlenmez → düşünme blokları geçerli kalır).
 */
export async function runAssistantTurn(
  client: Anthropic,
  history: MessageParam[],
  userText: string,
  tc: ToolContext,
  opts: AssistantOptions,
): Promise<TurnResult> {
  const appended: MessageParam[] = [{ role: "user", content: userText }];
  const system = SYSTEM_PROMPT.replace("{KVKK_URL}", opts.kvkkUrl);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: 16000,
      system,
      tools: TOOLS,
      messages: [...history, ...appended],
      output_config: { effort: opts.effort ?? "medium" },
      // Geçmiş yalnızca sona eklenir; yine de bir uyumsuzlukta hata yerine bloğu düşür
      thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
      // Güvenlik sınıflandırıcısı reddederse Anthropic'in önerdiği modelde otomatik tekrar
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"],
    });

    if (response.stop_reason === "refusal") {
      return {
        reply: "Bu konuda size buradan yardımcı olamıyorum; bir temsilcimiz sizinle iletişime geçecek.",
        appended: [...appended, { role: "assistant", content: [{ type: "text", text: "(yanıt verilemedi)" }] }],
        handoff: { reason: `Model yanıtı reddetti (${response.stop_details?.category ?? "bilinmiyor"})` },
      };
    }

    // Yanıtın tamamı (düşünme blokları dahil) değiştirilmeden eklenir
    appended.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;

    const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const reply = response.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: reply || "Anlayamadım, tekrar yazar mısınız?", appended, handoff: tc.handoff };
    }

    // Paralel araç çağrıları birlikte yürütülür, sonuçlar tek kullanıcı mesajında döner
    const results: ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (t): Promise<ToolResultBlockParam> => {
        try {
          const out = await executeTool(t.name, (t.input ?? {}) as Record<string, unknown>, tc);
          return { type: "tool_result", tool_use_id: t.id, content: JSON.stringify(out) };
        } catch (e) {
          const known = e instanceof HttpError || e instanceof ValidationError || e instanceof PricingError || e instanceof MapsError;
          const msg = known ? e.message : "İşlem sırasında bir hata oluştu";
          if (!known) console.error("araç hatası", t.name, e);
          return { type: "tool_result", tool_use_id: t.id, content: JSON.stringify({ error: msg }), is_error: true };
        }
      }),
    );
    appended.push({ role: "user", content: results });
  }

  return {
    reply: "İsteğinizi tamamlayamadım; bir temsilcimiz size dönecek.",
    appended,
    handoff: { reason: "Araç döngüsü sınırı aşıldı" },
  };
}
