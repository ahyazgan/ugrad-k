"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, buttonClass, Card, EmptyState, ErrorText, Input, PageHeader, Select, Stat, Table, Td } from "@/components/ui";
import { fmtDateTime, istDate } from "@/lib/dates";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

export default function MusterilerPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const { data, error, reload } = useLoad(async () => {
    const [customers, corporate] = await Promise.all([repo.listCustomers(query || undefined), repo.listCorporateAccounts()]);
    return { customers, corporate };
  }, [query]);
  // KPIs always describe the whole customer base, not the current search
  const all = useLoad(() => repo.listCustomers());
  const month = istDate().slice(0, 7);
  const base = all.data ?? [];
  const kpi = {
    total: base.length,
    corporate: base.filter((c) => c.corporateAccountId).length,
    newThisMonth: base.filter((c) => istDate(c.createdAt).startsWith(month)).length,
    noOrders: base.filter((c) => c.orderCount === 0).length,
  };
  const v = (n: number) => (all.data ? n : "…");

  return (
    <>
      <PageHeader
        title="Müşteriler"
        subtitle="Kurumsal hesaba bağlanan müşteriler cari hesapla sipariş verebilir."
        actions={
          <Link href="/siparisler/yeni" className={buttonClass("primary")}>
            + Telefon siparişi
          </Link>
        }
      />
      <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(320px,1fr)_2fr] xl:items-stretch">
        <Card className="flex flex-col justify-center">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search.trim());
            }}
          >
            <Input aria-label="Müşteri ara" placeholder="Ad, telefon veya e-posta" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button type="submit">Ara</Button>
          </form>
          {query ? (
            <button
              className="mt-2 self-start text-xs font-semibold text-brand underline underline-offset-2"
              onClick={() => {
                setSearch("");
                setQuery("");
              }}
            >
              Aramayı temizle
            </button>
          ) : null}
        </Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Toplam müşteri" value={v(kpi.total)} />
          <Stat label="Kurumsala bağlı" value={v(kpi.corporate)} hint="Cari hesapla sipariş verir" />
          <Stat label="Bu ay yeni" value={v(kpi.newThisMonth)} />
          <Stat label="Hiç sipariş vermemiş" value={v(kpi.noOrders)} tone={kpi.noOrders ? "warn" : "default"} hint="Hoş geldin kampanyası adayı" />
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <Card title={query ? `“${query}” için sonuçlar` : "Tüm müşteriler"}>
        <Table
          head={["Müşteri", "İletişim", "Kayıt", "Sipariş", "Kurumsal hesap"]}
          num={[3]}
          empty={
            !data ? (
              "Yükleniyor…"
            ) : query ? (
              <EmptyState
                title={`'${query}' için müşteri bulunamadı.`}
                description="Numara yeni bir müşteriye aitse siparişi telefonla girerken müşteri kaydı da açılır."
                action={
                  <Link href="/siparisler/yeni" className={buttonClass("secondary", "sm")}>
                    Telefon siparişi
                  </Link>
                }
              />
            ) : (
              <EmptyState
                sticker="telefon"
                title="Henüz müşteri yok"
                description="Uygulamadan, web sitesinden veya telefonla ilk sipariş geldiğinde müşteri kaydı otomatik açılır."
              />
            )
          }
        >
          {(data?.customers ?? []).map((c) => (
            <tr key={c.id}>
              <Td className="font-semibold">{c.fullName ?? "—"}</Td>
              <Td>
                <div>{c.phone}</div>
                <div className="text-xs text-muted">{c.email}</div>
              </Td>
              <Td className="whitespace-nowrap">{fmtDateTime(c.createdAt)}</Td>
              <Td num>{c.orderCount}</Td>
              <Td className="w-64">
                <Select
                  aria-label={`${c.fullName ?? "Müşteri"} kurumsal hesap`}
                  value={c.corporateAccountId ?? ""}
                  onChange={(e) =>
                    repo.setCustomerCorporate(c.id, e.target.value || null).then(() => {
                      reload();
                      all.reload();
                    })
                  }
                  className="py-1.5"
                >
                  <option value="">Bireysel</option>
                  {(data?.corporate ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.companyName}
                    </option>
                  ))}
                </Select>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
