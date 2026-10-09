import { BRAND } from "@yazgan/shared";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHero } from "@/components/PageHero";
import { economyWindowText, tl } from "@/lib/pricing-info";
import { getPricingSettings } from "@/lib/pricing-settings";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Kurumsal API belgeleri",
  description: `${BRAND.name} kurumsal API: fiyat alma, sipariş oluşturma, sipariş durumu ve webhook bildirimleri.`,
  alternates: { canonical: "/api-belgeleri" },
};

// ISR: limits quoted below follow the live tariff; re-read at most once an hour.
export const revalidate = 3600;

const BASE = `${SITE_URL}/api/v1`;

function Code({ children }: { children: string }) {
  return <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm leading-relaxed text-slate-100">{children}</pre>;
}
/** Stable anchor id per endpoint, e.g. "get-orders-id" (method keeps GET/POST /orders apart) */
const endpointId = (method: string, path: string) =>
  `${method.toLowerCase()}-${path.replace(/[{}]/g, "").replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`;

const ENDPOINTS: Array<[string, string]> = [
  ["POST", "/quotes"],
  ["POST", "/orders"],
  ["GET", "/orders/{id}"],
  ["GET", "/orders"],
  ["POST", "/orders/{id}/cancel"],
];

const TOC = [
  { id: "baslarken", label: "Başlarken" },
  { id: "uc-noktalar", label: "Uç noktalar" },
  { id: "durumlar", label: "Sipariş durumları" },
  { id: "hatalar", label: "Hatalar" },
  { id: "webhook", label: "Webhook" },
];

const H2 = "scroll-mt-24 text-2xl font-black tracking-[-0.03em] text-brand";

function Endpoint({ method, path, children }: { method: string; path: string; children: ReactNode }) {
  return (
    <section className="mt-10 scroll-mt-24" id={endpointId(method, path)}>
      <h3 className="flex flex-wrap items-center gap-2 text-lg font-bold text-slate-900">
        <span className={`rounded-md px-2 py-0.5 font-mono text-sm text-white ${method === "GET" ? "bg-emerald-700" : "bg-brand"}`}>{method}</span>
        <code className="font-mono">{path}</code>
      </h3>
      <div className="mt-2 text-slate-700">{children}</div>
    </section>
  );
}

const orderExample = `{
  "externalRef": "ERP-2026-0042",
  "pickup": {
    "address": "Kılıçlı Mah. Şile Cad. No: 8A, Beykoz/İstanbul",
    "lat": 41.1295, "lng": 29.1135,
    "details": "Kat 2, resepsiyon",
    "contactName": "Ayşe Yılmaz", "contactPhone": "+905321112233"
  },
  "dropoff": {
    "address": "Levent Mah., Büyükdere Cad., Beşiktaş/İstanbul",
    "contactName": "Ali Demir", "contactPhone": "+905334445566"
  },
  "serviceLevel": "acil",
  "roundTrip": false,
  "weightKg": null,
  "largePackage": false,
  "declaredValueKurus": 2500000,
  "deliveryCode": true,
  "scheduledPickupAt": null,
  "packageDescription": "Sözleşme (2 nüsha)",
  "customerNote": "İmzalı nüshayı geri getirin"
}`;

const orderResponse = `{
  "order": {
    "id": "0d6c…",
    "orderNo": "YK-1042",
    "externalRef": "ERP-2026-0042",
    "status": "beklemede",
    "statusLabel": "Beklemede",
    "subtotalKurus": 92050,
    "vatKurus": 18410,
    "totalKurus": 110460,
    "trackingUrl": "${BRAND.panelUrl}/takip/…",
    "proofOfDelivery": null
  },
  "quote": { "lines": [ … ], "totalKurus": 110460 }
}`;

const verifyNode = `import crypto from "node:crypto";

// Express örneği: gövdeyi ham (string) olarak alın
app.post("/kurye-webhook", express.text({ type: "application/json" }), (req, res) => {
  const ts = req.header("X-Webhook-Timestamp");
  const sig = req.header("X-Webhook-Signature"); // "v1=<hex>"
  const expected = "v1=" + crypto
    .createHmac("sha256", process.env.KURYE_WEBHOOK_SECRET)
    .update(\`\${ts}.\${req.body}\`)
    .digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(ts)) < 300; // 5 dk
  if (!fresh || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).end();
  }
  const event = JSON.parse(req.body);
  // event.id ile tekrarları ayıklayın (aynı olay birden fazla gelebilir)
  console.log(event.event, event.order.orderNo, event.order.previousStatus, "→", event.order.status);
  res.status(200).end();
});`;

export default async function ApiDocsPage() {
  const settings = await getPricingSettings();
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 lg:pt-14">
      <PageHero
        title="Kurumsal API"
        lead="Kendi yazılımınızdan (ERP, e-ticaret, büro yazılımı) fiyat alın, sipariş açın ve durumunu izleyin. Sipariş durumu değiştikçe sisteminize webhook ile bildirim gönderelim."
      />
      <div className="mt-10 grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="İçindekiler" className="hidden lg:block">
          <div className="sticky top-24 rounded-3xl bg-white p-4 text-sm">
            <div className="px-2 text-xs font-extrabold tracking-[0.14em] text-neo-muted uppercase">İçindekiler</div>
            <ul className="mt-2 space-y-0.5">
              {TOC.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="block rounded-xl px-2 py-1.5 font-bold text-brand hover:bg-neo-bg">
                    {t.label}
                  </a>
                  {t.id === "uc-noktalar" ? (
                    <ul className="mb-1 ml-2 space-y-0.5 border-l-2 border-neo-bg pl-2">
                      {ENDPOINTS.map(([m, p]) => (
                        <li key={m + p}>
                          <a href={`#${endpointId(m, p)}`} className="block rounded-lg px-2 py-1 font-mono text-xs text-neo-muted-dark hover:bg-neo-bg">
                            <span className="font-bold">{m}</span> {p}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <div className="max-w-4xl min-w-0">
          <h2 id="baslarken" className={H2}>Başlarken</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-700">
            <li>
              <Link href="/kurumsal" className="font-semibold text-brand underline">
                Kurumsal hesap
              </Link>{" "}
              açın. API anahtarınızı ve webhook gizli anahtarınızı size ileteceğiz.
            </li>
            <li>
              Tüm isteklerde anahtarı başlıkta gönderin: <code className="rounded bg-slate-100 px-1.5 font-mono text-sm">Authorization: Bearer yk_live_…</code>
            </li>
            <li>
              Adres: <code className="rounded bg-slate-100 px-1.5 font-mono text-sm">{BASE}</code> · JSON · UTF-8. Tutarlar kuruş (tam sayı) cinsindendir.
            </li>
            <li>API siparişleri cari hesabınıza işlenir ve ay sonunda tek faturada toplanır. Sınır: anahtar başına dakikada 120 istek.</li>
          </ol>
          <Code>{`curl ${BASE}/ping -H "Authorization: Bearer $KURYE_API_KEY"`}</Code>

          <h2 id="uc-noktalar" className={`mt-12 ${H2}`}>Uç noktalar</h2>

          <Endpoint method="POST" path="/quotes">
            Sipariş açmadan fiyat alır. Gövde sipariş ile aynıdır. Adresler için <code className="font-mono">lat</code>/<code className="font-mono">lng</code> göndermenizi öneririz;
            yalnız <code className="font-mono">address</code> gönderirseniz adres harita servisinden çözülür.
          </Endpoint>

          <Endpoint method="POST" path="/orders">
            Sipariş oluşturur (yanıt <code className="font-mono">201</code>). <code className="font-mono">externalRef</code> sizin kayıt numaranızdır: aynı referansla tekrar gönderirseniz yeni sipariş açılmaz, mevcut sipariş{" "}
            <code className="font-mono">200</code> ve <code className="font-mono">&quot;duplicate&quot;: true</code> ile döner. Ağ hatasında güvenle tekrar deneyebilirsiniz.
            <Code>{orderExample}</Code>
            <p className="mt-3">
              <code className="font-mono">serviceLevel</code>: <code className="font-mono">&quot;standart&quot;</code> (varsayılan), <code className="font-mono">&quot;acil&quot;</code> (60 dk, ek ücretli) veya{" "}
              <code className="font-mono">&quot;ekonomi&quot;</code> (gün içinde, indirimli; yalnızca {economyWindowText(settings)} arası alışlarda). Eski{" "}
              <code className="font-mono">&quot;urgent&quot;: true</code> alanı hâlâ kabul edilir.{" "}
              {settings.maxWeightKg != null ? (
                <>
                  {settings.maxWeightKg.toLocaleString("tr-TR")} kg üzeri gönderiler <code className="font-mono">400</code> ile reddedilir.{" "}
                </>
              ) : null}
              <code className="font-mono">declaredValueKurus</code>: gönderi değeri (kuruş); {tl(settings.freeCoverageKurus)} üstü kısım için sigorta ücreti fiyata eklenir.{" "}
              <code className="font-mono">deliveryCode</code>: <code className="font-mono">true</code> ise alıcıya SMS ile 4 haneli teslim kodu gider, kurye kodu
              almadan teslim edemez; kod oluşturma yanıtında <code className="font-mono">order.deliveryCode</code> olarak da döner.{" "}
              <code className="font-mono">promoCode</code>: kampanya kodu (geçersizse <code className="font-mono">400</code>, alan <code className="font-mono">promoCode</code>).
            </p>
            <p className="mt-3">Yanıt:</p>
            <Code>{orderResponse}</Code>
          </Endpoint>

          <Endpoint method="GET" path="/orders/{id}">
            Siparişin güncel durumu, takip bağlantısı ve teslim alan kişi bilgisi.
          </Endpoint>

          <Endpoint method="GET" path="/orders">
            Son siparişler. Parametreler: <code className="font-mono">status</code>, <code className="font-mono">externalRef</code>, <code className="font-mono">limit</code> (en fazla 200).
          </Endpoint>

          <Endpoint method="POST" path="/orders/{id}/cancel">
            Kurye yola çıkmadan (durum <code className="font-mono">beklemede</code> veya <code className="font-mono">onaylandi</code>) iptal eder. Gövde: <code className="font-mono">{`{ "reason": "…" }`}</code>. Daha sonra{" "}
            <code className="font-mono">409</code> döner.
          </Endpoint>

          <h2 id="durumlar" className={`mt-12 ${H2}`}>Sipariş durumları</h2>
          <p className="mt-2 font-mono text-sm text-slate-700">beklemede → onaylandi → kuryeye_atandi → alindi → yolda → teslim_edildi · iptal · sorunlu</p>
          <p className="mt-1 text-sm text-slate-600">
            Teslim edilemezse: <span className="font-mono">yolda → geri_donuyor → geri_teslim</span> (paket göndericiye iade edilir;{" "}
            <span className="font-mono">failedReason</span>: alici_yok, adres_bulunamadi, alici_reddetti, kapali, diger; dönüş ayağı ücreti eklenir).
          </p>

          <h2 id="hatalar" className={`mt-12 ${H2}`}>Hatalar</h2>
          <p className="mt-2 text-slate-700">
            Hata yanıtları <code className="font-mono">{`{ "error": "Türkçe açıklama", "field": "pickup" }`}</code> biçimindedir. Kodlar: 400 geçersiz istek, 401 anahtar hatalı, 403 KVKK onayı eksik, 404 bulunamadı, 409 çakışma, 422 adres çözülemedi, 429 hız sınırı.
          </p>

          <h2 id="webhook" className={`mt-12 ${H2}`}>Webhook</h2>
          <p className="mt-2 text-slate-700">
            Sipariş oluştuğunda (<code className="font-mono">order.created</code>) ve durumu her değiştiğinde (<code className="font-mono">order.status_changed</code>) adresinize <code className="font-mono">POST</code> gönderilir. 2xx dışı yanıtta
            üstel bekleme ile 8 kez tekrar denenir; aynı olay birden fazla gelebilir, <code className="font-mono">id</code> ile ayıklayın. İmzayı mutlaka doğrulayın:
          </p>
          <Code>{`{
  "id": 1842,
  "event": "order.status_changed",
  "occurredAt": "2026-10-10T09:41:12Z",
  "order": {
    "id": "0d6c…", "orderNo": "YK-1042", "externalRef": "ERP-2026-0042",
    "status": "teslim_edildi", "previousStatus": "yolda", "totalKurus": 110460,
    "trackingUrl": "${BRAND.panelUrl}/takip/…", "deliveredAt": "2026-10-10T09:41:10Z",
    "proofOfDelivery": { "receiverName": "Resepsiyon - Zeynep" }, "cancelReason": null
  }
}`}</Code>
          <p className="mt-3 text-slate-700">İmza doğrulama örneği (Node.js):</p>
          <Code>{verifyNode}</Code>
        </div>
      </div>
    </div>
  );
}
