"use client";

import { AYDINLATMA_METNI, BRAND, formatTL, kvkkUrl } from "@yazgan/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AddressPicker, type PickedPoint } from "@/components/AddressPicker";
import { Button, Card, ErrorText, Input, PageHeader, Select } from "@/components/ui";
import { repo, type AdminQuote, type OrderRequestInput, type PhoneCustomer } from "@/lib/repo";

const KVKK_SCRIPT =
  `Siparişinizi alabilmem için adınız, telefonunuz ve adres bilgileriniz ${BRAND.name} tarafından kurye hizmeti, ` +
  "faturalandırma ve yasal yükümlülükler için işlenecek; konum bilgisi harita sağlayıcısıyla paylaşılacak. " +
  `Aydınlatma metnine ${kvkkUrl.replace("https://", "")} adresinden ulaşabilirsiniz. Onaylıyor musunuz?`;

type Point = PickedPoint & { details?: string; contactName?: string; contactPhone?: string };

export default function TelefonSiparisiPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<{ phone: string; customer: PhoneCustomer | null } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [pickup, setPickup] = useState<Point | null>(null);
  const [dropoff, setDropoff] = useState<Point | null>(null);
  const [opts, setOpts] = useState({ urgent: false, roundTrip: false, largePackage: false, weightKg: "", packageDescription: "", customerNote: "", scheduled: "" });
  const [payment, setPayment] = useState<"nakit" | "cari">("nakit");
  const [consent, setConsent] = useState(false);
  const [quote, setQuote] = useState<{ key: string; q?: AdminQuote; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const customer = lookup?.customer ?? null;
  const digits = phone.replace(/\D/g, "").replace(/^(90|0)/, "");

  async function doLookup() {
    setLookupError(null);
    try {
      const c = await repo.lookupPhoneCustomer(phone);
      setLookup({ phone, customer: c });
      if (c?.fullName) setFullName(c.fullName);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Müşteri aranamadı");
    }
  }

  const order: OrderRequestInput | null =
    pickup && dropoff
      ? {
          pickup: { ...pickup, details: pickup.details || undefined, contactName: pickup.contactName || undefined, contactPhone: pickup.contactPhone || undefined },
          dropoff: { ...dropoff, details: dropoff.details || undefined, contactName: dropoff.contactName || undefined, contactPhone: dropoff.contactPhone || undefined },
          urgent: opts.urgent,
          roundTrip: opts.roundTrip,
          largePackage: opts.largePackage,
          weightKg: opts.weightKg ? Number(opts.weightKg.replace(",", ".")) : null,
          packageDescription: opts.packageDescription || undefined,
          customerNote: opts.customerNote || undefined,
          // datetime-local değeri İstanbul saatidir
          scheduledPickupAt: opts.scheduled ? new Date(`${opts.scheduled}:00+03:00`).toISOString() : null,
          paymentMethod: payment,
        }
      : null;
  // Fiyatı etkileyen alanlar değişince teklif yenilenir
  const quoteKey = order ? JSON.stringify({ ...order, paymentMethod: undefined, customerNote: undefined, packageDescription: undefined }) : "";

  useEffect(() => {
    if (!order) return;
    let alive = true;
    const key = quoteKey;
    const t = setTimeout(() => {
      repo.quote(order).then(
        (q) => alive && setQuote({ key, q }),
        (e: unknown) => alive && setQuote({ key, error: e instanceof Error ? e.message : "Fiyat hesaplanamadı" }),
      );
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  const current = quote?.key === quoteKey ? quote : null;
  const needsConsent = !customer?.hasConsent;
  const canSubmit = !!order && digits.length === 10 && lookup?.phone === phone && !!current?.q && (!needsConsent || consent) && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      const r = await repo.createPhoneOrder({ phone, fullName: fullName.trim(), verbalConsent: consent, order });
      router.push(`/siparisler/${r.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sipariş oluşturulamadı");
      setBusy(false);
    }
  }

  const pointExtras = (p: Point | null, set: (p: Point | null) => void, who: string, prefix: string) =>
    p ? (
      <div className="grid gap-2 sm:grid-cols-3">
        <Input placeholder="Adres tarifi (kat, daire, firma)" value={p.details ?? ""} onChange={(e) => set({ ...p, details: e.target.value })} data-testid={`${prefix}-details`} />
        <Input placeholder={`${who} adı`} value={p.contactName ?? ""} onChange={(e) => set({ ...p, contactName: e.target.value })} />
        <Input placeholder={`${who} telefonu`} value={p.contactPhone ?? ""} onChange={(e) => set({ ...p, contactPhone: e.target.value })} />
      </div>
    ) : null;

  return (
    <>
      <PageHeader
        title="Telefon siparişi"
        subtitle="Arayan müşterinin siparişini girin; fiyat uygulamadakiyle aynı hesaplanır."
        actions={
          <Link href="/siparisler" className="text-sm text-brand underline">
            ← Siparişler
          </Link>
        }
      />
      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Müşteri">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <Input label="Cep telefonu" placeholder="05xx xxx xx xx" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="phone" />
              </div>
              <Button type="button" variant="secondary" onClick={doLookup} disabled={digits.length !== 10} data-testid="lookup">
                Müşteriyi bul
              </Button>
            </div>
            <ErrorText>{lookupError}</ErrorText>
            {lookup && lookup.phone === phone ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm" data-testid="lookup-result">
                  {customer ? (
                    <>
                      <b>Kayıtlı müşteri</b>
                      {customer.corporateAccountId ? " · kurumsal (cari hesap)" : ""}
                      {customer.hasConsent ? " · KVKK onayı var" : " · KVKK onayı yok"}
                    </>
                  ) : (
                    <b>Yeni müşteri — sipariş ile birlikte kaydedilecek</b>
                  )}
                </p>
                <Input label="Ad Soyad" value={fullName} onChange={(e) => setFullName(e.target.value)} data-testid="full-name" />
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Önce numarayla müşteriyi bulun.</p>
            )}
          </Card>

          <Card title="Güzergâh">
            <div className="space-y-5">
              <AddressPicker label="Nereden (alış)" value={pickup} onChange={setPickup} recent={customer?.recentAddresses} testId="pickup" />
              {pointExtras(pickup, setPickup, "Teslim eden", "pickup")}
              <AddressPicker label="Nereye (teslim)" value={dropoff} onChange={setDropoff} recent={customer?.recentAddresses} testId="dropoff" />
              {pointExtras(dropoff, setDropoff, "Alıcı", "dropoff")}
            </div>
          </Card>

          <Card title="Gönderi">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Ne gönderiliyor?" value={opts.packageDescription} onChange={(e) => setOpts({ ...opts, packageDescription: e.target.value })} />
              <Input label="Ağırlık (kg)" inputMode="decimal" value={opts.weightKg} onChange={(e) => setOpts({ ...opts, weightKg: e.target.value })} />
              <Input label="Planlı alış (boşsa hemen)" type="datetime-local" value={opts.scheduled} onChange={(e) => setOpts({ ...opts, scheduled: e.target.value })} />
              <Input label="Kuryeye not" value={opts.customerNote} onChange={(e) => setOpts({ ...opts, customerNote: e.target.value })} />
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              {(
                [
                  ["urgent", "Acil (60 dk)"],
                  ["roundTrip", "Gidiş-dönüş"],
                  ["largePackage", "Büyük paket"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} data-testid={`opt-${k}`} />
                  {label}
                </label>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Fiyat">
            {!order ? (
              <p className="text-sm text-slate-500">Adresleri seçince fiyat hesaplanır.</p>
            ) : current?.error ? (
              <ErrorText>{current.error}</ErrorText>
            ) : !current?.q ? (
              <p className="text-sm text-slate-500">Hesaplanıyor…</p>
            ) : (
              <dl className="space-y-1.5 text-sm" data-testid="quote">
                <div className="text-xs text-slate-500">
                  {(current.q.distanceMeters / 1000).toFixed(1)} km · ~{Math.round(current.q.durationSeconds / 60)} dk
                  {current.q.bridgeCrossings ? " · köprü geçişi" : ""}
                </div>
                {current.q.quote.lines.map((l) => (
                  <div key={l.code} className="flex justify-between gap-3">
                    <dt className="text-slate-600">{l.label}</dt>
                    <dd className="whitespace-nowrap">{formatTL(l.amountKurus)}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1.5">
                  <dt>KDV</dt>
                  <dd>{formatTL(current.q.quote.vatKurus)}</dd>
                </div>
                <div className="flex justify-between text-base font-bold">
                  <dt>Toplam</dt>
                  <dd data-testid="total">{formatTL(current.q.quote.totalKurus)}</dd>
                </div>
              </dl>
            )}
          </Card>

          <Card title="Ödeme ve onay">
            <div className="space-y-3">
              <Select value={payment} onChange={(e) => setPayment(e.target.value as "nakit" | "cari")}>
                <option value="nakit">Kuryeye ödeme (nakit / IBAN)</option>
                {customer?.corporateAccountId ? <option value="cari">Cari hesap (ay sonu fatura)</option> : null}
              </Select>
              {needsConsent ? (
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="mb-2 font-semibold">Müşteriye okuyun:</p>
                  <p className="mb-2 italic">“{KVKK_SCRIPT}”</p>
                  <details className="mb-2 text-xs">
                    <summary className="cursor-pointer">Aydınlatma metninin tamamı</summary>
                    <p className="mt-2 whitespace-pre-line">{AYDINLATMA_METNI}</p>
                  </details>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="consent" />
                    Müşteri sözlü olarak onay verdi (kaydınızla saklanır)
                  </label>
                </div>
              ) : null}
              <ErrorText>{error}</ErrorText>
              <Button type="submit" className="w-full" disabled={!canSubmit} data-testid="submit">
                {busy ? "Kaydediliyor…" : "Siparişi oluştur"}
              </Button>
            </div>
          </Card>
        </div>
      </form>
    </>
  );
}
