"use client";

import { formatTL, normalizeCode, type PromoKind } from "@yazgan/shared";
import { useState, type FormEvent } from "react";
import { Button, Card, ErrorText, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { repo, type OpsSettings } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const EMPTY = { code: "", description: "", kind: "yuzde" as PromoKind, value: "", maxDiscount: "", minSubtotal: "", until: "", maxRedemptions: "", newOnly: false };
const tlToKurus = (s: string) => (s.trim() ? Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100) : null);

export default function KampanyalarPage() {
  const { data, error, reload } = useLoad(() => repo.listPromoCodes());
  const ops = useLoad(() => repo.getOpsSettings());
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setMsg(null);
    const code = normalizeCode(form.code);
    const value = Number(form.value.replace(",", "."));
    if (!/^[A-Z0-9]{3,40}$/.test(code)) return setFormError("Kod 3–40 harf/rakam olmalı (Türkçe karakter ve boşluk yok)");
    if (!(value > 0) || (form.kind === "yuzde" && value > 100)) return setFormError("İndirim değeri geçersiz");
    try {
      await repo.createPromoCode({
        code,
        description: form.description.trim() || null,
        kind: form.kind,
        value: form.kind === "tutar" ? Math.round(value * 100) : value,
        maxDiscountKurus: form.kind === "yuzde" ? tlToKurus(form.maxDiscount) : null,
        minSubtotalKurus: tlToKurus(form.minSubtotal) ?? 0,
        validFrom: null,
        validUntil: form.until ? new Date(`${form.until}T23:59:59+03:00`).toISOString() : null,
        maxRedemptions: form.maxRedemptions.trim() ? Number(form.maxRedemptions) : null,
        perCustomerLimit: 1,
        newCustomersOnly: form.newOnly,
      });
      setForm(EMPTY);
      setMsg(`${code} oluşturuldu.`);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Kaydedilemedi");
    }
  }

  return (
    <>
      <PageHeader
        title="Kampanyalar"
        subtitle="Kampanya kodları, davet ödülü ve geri kazanma mesajları. İndirim taşıma bedeline uygulanır (köprü, bekleme, sigorta hariç); kod sunucuda doğrulanır."
      />
      <ErrorText>{error}</ErrorText>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Kodlar">
            <Table head={["Kod", "İndirim", "Koşullar", "Kullanım", "Durum", ""]} empty="Henüz kampanya yok. Sağdaki formdan ilk indirim kodunu oluşturun.">
              {(data ?? []).map((p) => (
                <tr key={p.code} className={p.active ? "" : "opacity-50"} data-testid={`promo-${p.code}`}>
                  <Td>
                    <div className="font-mono font-semibold">{p.code}</div>
                    <div className="text-xs text-muted">{p.source === "geri_kazanma" ? "Geri kazanma (kişiye özel)" : p.description}</div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {p.kind === "yuzde" ? `%${p.value.toLocaleString("tr-TR")}` : formatTL(p.value)}
                    {p.maxDiscountKurus ? <div className="text-xs text-muted">en fazla {formatTL(p.maxDiscountKurus)}</div> : null}
                  </Td>
                  <Td className="text-xs text-ink-soft">
                    {[
                      p.newCustomersOnly ? "yalnız ilk sipariş" : null,
                      p.minSubtotalKurus ? `en az ${formatTL(p.minSubtotalKurus)}` : null,
                      p.validUntil ? `son: ${fmtDateTime(p.validUntil)}` : null,
                      p.maxRedemptions ? `toplam ${p.maxRedemptions} kullanım` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {p.redemptions}
                    {p.discountKurus ? <div className="text-xs text-muted">{formatTL(p.discountKurus)} indirim</div> : null}
                  </Td>
                  <Td>{p.active ? <span className="font-semibold text-emerald-700">Açık</span> : "Kapalı"}</Td>
                  <Td>
                    <Button variant="ghost" onClick={() => repo.setPromoActive(p.code, !p.active).then(reload)}>
                      {p.active ? "Kapat" : "Aç"}
                    </Button>
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
          {ops.data ? <GrowthSettings initial={ops.data} onSaved={ops.reload} /> : null}
        </div>

        <Card title="Yeni kampanya kodu">
          <form onSubmit={create} className="space-y-3">
            <Input label="Kod" placeholder="Örn. BAHAR20" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            <Input label="Açıklama" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Select label="Tür" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PromoKind })}>
                <option value="yuzde">Yüzde</option>
                <option value="tutar">Tutar (TL)</option>
              </Select>
              <Input label={form.kind === "yuzde" ? "İndirim (%)" : "İndirim (TL)"} inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required data-testid="promo-value" />
            </div>
            {form.kind === "yuzde" ? (
              <Input label="En fazla indirim (TL, isteğe bağlı)" inputMode="decimal" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} />
            ) : null}
            <Input label="En düşük sipariş (TL, KDV hariç)" inputMode="decimal" value={form.minSubtotal} onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })} />
            <Input label="Son geçerlilik günü" type="date" value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} />
            <Input label="Toplam kullanım sınırı" inputMode="numeric" value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.newOnly} onChange={(e) => setForm({ ...form, newOnly: e.target.checked })} />
              Yalnız ilk siparişte
            </label>
            <p className="text-xs text-muted">Her müşteri bir kodu bir kez kullanabilir. İptal edilen siparişte kullanım geri alınır.</p>
            <ErrorText>{formError}</ErrorText>
            {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
            <Button type="submit" className="w-full" data-testid="create-promo">
              Kodu oluştur
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}

function GrowthSettings({ initial, onSaved }: { initial: OpsSettings; onSaved: () => void }) {
  const [form, setForm] = useState({
    referral: String(initial.referralRewardKurus / 100),
    winbackEnabled: initial.winbackEnabled,
    winbackAfterDays: String(initial.winbackAfterDays),
    winbackDiscountPct: String(initial.winbackDiscountPct),
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const referral = tlToKurus(form.referral) ?? 0;
    const days = Number(form.winbackAfterDays);
    const pct = Number(form.winbackDiscountPct.replace(",", "."));
    if (referral < 0 || !(days >= 7 && days <= 365) || !(pct >= 1 && pct <= 50)) return setErr("Geçersiz değer (gün 7–365, indirim %1–50)");
    try {
      await repo.saveOpsSettings({ ...initial, referralRewardKurus: referral, winbackEnabled: form.winbackEnabled, winbackAfterDays: days, winbackDiscountPct: pct });
      setMsg("Kaydedildi");
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Kaydedilemedi");
    }
  }

  return (
    <Card title="Davet ve geri kazanma">
      <form onSubmit={save} className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <div>
          <Input label="Davet ödülü (TL)" inputMode="decimal" value={form.referral} onChange={(e) => setForm({ ...form, referral: e.target.value })} />
          <p className="mt-1 text-xs text-muted">
            Yeni müşteri ilk siparişinde davet koduyla bu kadar indirim alır; davet eden, o gönderi teslim edilince aynı tutarda kredi kazanır
            (sonraki siparişinden düşülür). 0 = kapalı.
          </p>
        </div>
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={form.winbackEnabled} onChange={(e) => setForm({ ...form, winbackEnabled: e.target.checked })} data-testid="winback-enabled" />
            <span>
              <b>Geri kazanma mesajı gönder</b>
              <span className="block text-muted">
                Ticari ileti onayı veren ve bir süredir sipariş vermeyen müşteriye günde bir kez kişiye özel, 14 gün geçerli kod gider. İYS kaydı
                gerekir (docs/kurulum.md §27).
              </span>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Input label="Sessizlik (gün)" inputMode="numeric" value={form.winbackAfterDays} onChange={(e) => setForm({ ...form, winbackAfterDays: e.target.value })} />
            <Input label="İndirim (%)" inputMode="decimal" value={form.winbackDiscountPct} onChange={(e) => setForm({ ...form, winbackDiscountPct: e.target.value })} />
          </div>
        </div>
        <div className="md:col-span-2 flex items-center gap-3">
          <Button type="submit">Kaydet</Button>
          <ErrorText>{err}</ErrorText>
          {msg ? <span className="text-sm text-emerald-700">{msg}</span> : null}
        </div>
      </form>
    </Card>
  );
}
