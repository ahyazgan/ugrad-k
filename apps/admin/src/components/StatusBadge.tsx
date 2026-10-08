import { ORDER_STATUS_LABELS, type OrderStatus } from "@yazgan/shared";

const TONE: Record<OrderStatus, string> = {
  beklemede: "bg-amber-100 text-amber-800",
  onaylandi: "bg-sky-100 text-sky-800",
  kuryeye_atandi: "bg-indigo-100 text-indigo-800",
  alindi: "bg-violet-100 text-violet-800",
  yolda: "bg-violet-100 text-violet-800",
  teslim_edildi: "bg-emerald-100 text-emerald-800",
  iptal: "bg-slate-100 text-slate-600",
  sorunlu: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[status]}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
