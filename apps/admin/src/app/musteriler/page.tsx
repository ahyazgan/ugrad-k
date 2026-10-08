"use client";

import { useState } from "react";
import { Button, ErrorText, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

export default function MusterilerPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const { data, error, reload } = useLoad(async () => {
    const [customers, corporate] = await Promise.all([repo.listCustomers(query || undefined), repo.listCorporateAccounts()]);
    return { customers, corporate };
  }, [query]);

  return (
    <>
      <PageHeader title="Müşteriler" subtitle="Kurumsal hesaba bağlanan müşteriler cari hesapla sipariş verebilir." />
      <form
        className="mb-4 flex max-w-lg gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
        }}
      >
        <Input placeholder="Ad, telefon veya e-posta" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button type="submit">Ara</Button>
      </form>
      <ErrorText>{error}</ErrorText>
      <Table head={["Müşteri", "İletişim", "Kayıt", "Sipariş", "Kurumsal hesap"]}>
        {(data?.customers ?? []).map((c) => (
          <tr key={c.id}>
            <Td className="font-semibold">{c.fullName ?? "—"}</Td>
            <Td>
              <div>{c.phone}</div>
              <div className="text-xs text-slate-500">{c.email}</div>
            </Td>
            <Td className="whitespace-nowrap">{fmtDateTime(c.createdAt)}</Td>
            <Td>{c.orderCount}</Td>
            <Td>
              <Select
                value={c.corporateAccountId ?? ""}
                onChange={(e) => repo.setCustomerCorporate(c.id, e.target.value || null).then(reload)}
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
    </>
  );
}
