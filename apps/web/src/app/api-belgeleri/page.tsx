import { BRAND } from "@yazgan/shared";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Kurumsal API belgeleri",
  description: `${BRAND.name} kurumsal API: fiyat alma, sipariş oluşturma, sipariş durumu ve webhook bildirimleri.`,
  alternates: { canonical: "/api-belgeleri" },
};

const BASE = `${SITE_URL}/api/v1`;

function Code({ children }: { children: string }) {
  return <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm leading-relaxed text-slate-100">{children}</pre>;
}
function Endpoint({ method, path, children }: { method: string; path: string; children: ReactNode }) {
  return (
    <section className="mt-10" id={path.replace(/[^a-z]/g, "-")}>
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

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-slate-900">Kurumsal API</h1>
      <p className="mt-3 text-lg text-slate-600">
        Kendi yazılımınızdan (ERP, e-ticaret, büro yazılımı) fiyat alın, sipariş açın ve durumunu izleyin. Sipariş durumu değiştikçe sisteminize webhook ile bildirim gönderelim.
      </p>

      <h2 className="mt-10 text-xl font-bold text-slate-900">Başlarken</h2>
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

      <h2 className="mt-12 text-xl font-bold text-slate-900">Uç noktalar</h2>

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
          <code className="font-mono">&quot;ekonomi&quot;</code> (gün içinde, indirimli; yalnızca Pazartesi–Cumartesi öğleden önceki alışlarda). Eski{" "}
          <code className="font-mono">&quot;urgent&quot;: true</code> alanı hâlâ kabul edilir. 20 kg üzeri gönderiler <code className="font-mono">400</code> ile reddedilir.{" "}
          <code className="font-mono">declaredValueKurus</code>: gönderi değeri (kuruş); 1.000 TL üstü kısım için sigorta ücreti fiyata eklenir.{" "}
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

      <h2 className="mt-12 text-xl font-bold text-slate-900">Sipariş durumları</h2>
      <p className="mt-2 font-mono text-sm text-slate-700">beklemede → onaylandi → kuryeye_atandi → alindi → yolda → teslim_edildi · iptal · sorunlu</p>
      <p className="mt-1 text-sm text-slate-600">
        Teslim edilemezse: <span className="font-mono">yolda → geri_donuyor → geri_teslim</span> (paket göndericiye iade edilir;{" "}
        <span className="font-mono">failedReason</span>: alici_yok, adres_bulunamadi, alici_reddetti, kapali, diger; dönüş ayağı ücreti eklenir).
      </p>

      <h2 className="mt-12 text-xl font-bold text-slate-900">Hatalar</h2>
      <p className="mt-2 text-slate-700">
        Hata yanıtları <code className="font-mono">{`{ "error": "Türkçe açıklama", "field": "pickup" }`}</code> biçimindedir. Kodlar: 400 geçersiz istek, 401 anahtar hatalı, 403 KVKK onayı eksik, 404 bulunamadı, 409 çakışma, 422 adres çözülemedi, 429 hız sınırı.
      </p>

      <h2 className="mt-12 text-xl font-bold text-slate-900">Webhook</h2>
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
  );
}
