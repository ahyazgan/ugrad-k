"use client";

import { useState } from "react";
import { Button, Card, ErrorText, Input, Select, Table, Td } from "@/components/ui";
import { generateWebhookSecret } from "@/lib/api-keys";
import { fmtDateTime } from "@/lib/dates";
import { repo, type CorporateAccount, type WebhookConfig } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

const DELIVERY: Record<string, [string, string]> = {
  pending: ["Bekliyor", "text-amber-700"],
  processing: ["Gönderiliyor", "text-sky-700"],
  delivered: ["İletildi", "text-emerald-700"],
  failed: ["Başarısız", "text-red-700"],
};

function WebhookForm({ accountId, initial, onSaved }: { accountId: string; initial: WebhookConfig | null; onSaved: () => void }) {
  const [cfg, setCfg] = useState<WebhookConfig>(initial ?? { url: "", secret: generateWebhookSecret(), active: true });
  const [showSecret, setShowSecret] = useState(!initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await repo.saveWebhook(accountId, cfg);
          setMsg("Webhook kaydedildi");
          onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Kaydedilemedi");
        }
      }}
    >
      <Input label="Webhook adresi (https)" placeholder="https://firma.com/kurye-webhook" value={cfg.url} onChange={(e) => setCfg({ ...cfg, url: e.target.value })} data-testid="webhook-url" />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-72 flex-1">
          <Input label="İmza gizli anahtarı" readOnly value={showSecret ? cfg.secret : `${cfg.secret.slice(0, 10)}${"•".repeat(16)}`} className="font-mono" />
        </div>
        <Button type="button" variant="ghost" onClick={() => setShowSecret((v) => !v)}>
          {showSecret ? "Gizle" : "Göster"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => (setCfg({ ...cfg, secret: generateWebhookSecret() }), setShowSecret(true))}>
          Yeni anahtar üret
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={cfg.active} onChange={(e) => setCfg({ ...cfg, active: e.target.checked })} /> Etkin
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit">Webhook&apos;u kaydet</Button>
        {msg ? <span className="text-sm text-emerald-700">{msg}</span> : null}
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

/** Kurumsal hesap için API anahtarları ve sipariş durum webhook'u */
export function ApiAccess({ accounts }: { accounts: CorporateAccount[] }) {
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, reload } = useLoad(async () => {
    if (!accountId) return null;
    const [keys, members, webhook, deliveries] = await Promise.all([
      repo.listApiKeys(accountId),
      repo.listCustomers().then((cs) => cs.filter((c) => c.corporateAccountId === accountId)),
      repo.getWebhook(accountId),
      repo.listWebhookDeliveries(accountId),
    ]);
    return { keys, members, webhook, deliveries };
  }, [accountId]);

  async function create() {
    setError(null);
    try {
      const { key } = await repo.createApiKey(accountId, owner || data?.members[0]?.id || "", name);
      setNewKey(key);
      setName("");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anahtar oluşturulamadı");
    }
  }

  return (
    <Card title="API ve webhook">
      <p className="mb-3 text-sm text-ink-soft">
        Kurumsal müşteri kendi yazılımından sipariş açabilir (API) ve sipariş durumu değiştikçe kendi sistemine bildirim alabilir (webhook). Belge:{" "}
        <span className="font-mono">/api-belgeleri</span> (web sitesi).
      </p>
      <div className="max-w-sm">
        <Select label="Kurumsal hesap" value={accountId} onChange={(e) => (setAccountId(e.target.value), setNewKey(null))} data-testid="api-account">
          <option value="">Seçin…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.companyName}
            </option>
          ))}
        </Select>
      </div>
      {accountId && data ? (
        <div className="mt-5 grid gap-6">
          <section>
            <h3 className="mb-2 font-semibold text-slate-900">API anahtarları</h3>
            {data.members.length === 0 ? (
              <p className="text-sm text-amber-700">Bu hesaba bağlı kullanıcı yok. Önce Müşteriler sayfasından bir kullanıcıyı bu hesaba bağlayın; siparişler o kullanıcı adına açılır.</p>
            ) : (
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <Input label="Anahtar adı" placeholder="ör. ERP sistemi" value={name} onChange={(e) => setName(e.target.value)} className="w-56" data-testid="api-key-name" />
                <Select label="Siparişler kimin adına" value={owner} onChange={(e) => setOwner(e.target.value)} className="w-56">
                  {data.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName ?? m.phone}
                    </option>
                  ))}
                </Select>
                <Button onClick={create} data-testid="api-key-create">
                  Anahtar oluştur
                </Button>
              </div>
            )}
            {newKey ? (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm" data-testid="api-key-new">
                <div className="font-semibold text-amber-900">Anahtar yalnızca şimdi gösterilir; güvenli bir yere kopyalayın.</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded bg-white px-2 py-1 font-mono text-slate-900">{newKey}</code>
                  <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(newKey)}>
                    Kopyala
                  </Button>
                </div>
              </div>
            ) : null}
            <ErrorText>{error}</ErrorText>
            <Table head={["Ad", "Anahtar", "Kullanıcı", "Oluşturma", "Son kullanım", ""]} empty="Henüz API anahtarı yok. Yukarıdan bir ad verip anahtar oluşturun.">
              {data.keys.map((k) => (
                <tr key={k.id}>
                  <Td>{k.name}</Td>
                  <Td className="font-mono text-xs">{k.prefix}…</Td>
                  <Td>{k.profileName ?? "—"}</Td>
                  <Td className="whitespace-nowrap">{fmtDateTime(k.createdAt)}</Td>
                  <Td className="whitespace-nowrap">{fmtDateTime(k.lastUsedAt)}</Td>
                  <Td>
                    {k.revokedAt ? (
                      <span className="text-xs text-muted">İptal edildi</span>
                    ) : (
                      <Button variant="ghost" onClick={() => repo.revokeApiKey(k.id).then(reload)}>
                        İptal et
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-slate-900">Sipariş durum webhook&apos;u</h3>
            <WebhookForm key={accountId} accountId={accountId} initial={data.webhook} onSaved={reload} />
            {data.deliveries.length ? (
              <div className="mt-4">
                <Table head={["Zaman", "Olay", "Sipariş", "Durum", "Deneme", "Hata"]} num={[4]} empty="Henüz webhook gönderimi yok.">
                  {data.deliveries.map((d) => (
                    <tr key={d.id}>
                      <Td className="whitespace-nowrap">{fmtDateTime(d.createdAt)}</Td>
                      <Td className="font-mono text-xs">{d.event}</Td>
                      <Td>{d.orderNo ?? "—"}</Td>
                      <Td className={DELIVERY[d.status]?.[1]}>{DELIVERY[d.status]?.[0] ?? d.status}</Td>
                      <Td num>{d.attempts}</Td>
                      <Td className="text-xs text-red-700">{d.lastError ?? ""}</Td>
                    </tr>
                  ))}
                </Table>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </Card>
  );
}
