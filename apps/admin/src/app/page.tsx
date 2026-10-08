"use client";

import { formatTL } from "@yazgan/shared";
import Link from "next/link";
import { useEffect } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, ErrorText, PageHeader, Stat, Table, Td } from "@/components/ui";
import { fmtTime, istDate } from "@/lib/dates";
import { repo } from "@/lib/repo";
import { useLoad } from "@/lib/use-load";

export default function Dashboard() {
  const today = istDate();
  const { data, error, reload } = useLoad(async () => {
    const [todayOrders, open, couriers] = await Promise.all([
      repo.listOrders({ from: today, to: today }),
      repo.listOrders({ statuses: ["beklemede", "onaylandi", "sorunlu"] }),
      repo.listCouriers(),
    ]);
    return { todayOrders, open, couriers };
  }, [today]);

  useEffect(() => repo.subscribeOrders(reload), [reload]);

  const delivered = data?.todayOrders.filter((o) => o.status === "teslim_edildi") ?? [];
  const active = data?.todayOrders.filter((o) => ["kuryeye_atandi", "alindi", "yolda"].includes(o.status)) ?? [];
  const revenue = delivered.reduce((s, o) => s + o.subtotalKurus, 0);

  return (
    <>
      <PageHeader title="Genel bakış" subtitle={`Bugün: ${new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "full" })}`} />
      <ErrorText>{error}</ErrorText>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bugünkü sipariş" value={data?.todayOrders.length ?? "…"} />
        <Stat label="Yolda / atanmış" value={active.length} />
        <Stat label="Teslim edilen" value={delivered.length} />
        <Stat label="Bugünkü ciro (KDV hariç)" value={formatTL(revenue)} hint="Teslim edilen siparişler" />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="İşlem bekleyen siparişler">
            <Table head={["No", "Saat", "Durum", "Nereden → Nereye", "Tutar"]} empty="Bekleyen sipariş yok 🎉">
              {(data?.open ?? []).map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <Td>
                    <Link className="font-semibold text-brand hover:underline" href={`/siparisler/${o.id}`}>
                      {o.orderNo}
                    </Link>
                    {o.urgent ? <span className="ml-1 text-xs font-bold text-amber-600">ACİL</span> : null}
                  </Td>
                  <Td>{fmtTime(o.createdAt)}</Td>
                  <Td>
                    <StatusBadge status={o.status} />
                  </Td>
                  <Td className="max-w-md">
                    <div className="truncate">{o.pickupAddress}</div>
                    <div className="truncate text-slate-500">→ {o.dropoffAddress}</div>
                  </Td>
                  <Td>{formatTL(o.totalKurus)}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        <Card title="Kuryeler">
          <ul className="space-y-2 text-sm">
            {(data?.couriers ?? [])
              .filter((c) => c.active)
              .map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span>
                    <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${c.onBreak ? "bg-amber-400" : c.isOnShift ? "bg-emerald-500" : "bg-slate-300"}`} />
                    {c.fullName}
                  </span>
                  <span className="text-slate-500">
                    {c.onBreak ? `Molada · ${c.activeOrderCount} aktif iş` : c.isOnShift ? `${c.activeOrderCount} aktif iş` : "Vardiya dışı"}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
