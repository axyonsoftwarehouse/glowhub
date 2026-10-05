import { formatCentsBRL } from "@/lib/money";
import {
  STATUS_LABELS,
  type AppointmentStatus,
} from "@/app/(app)/appointments/types";

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  check_in: "bg-indigo-100 text-indigo-700",
  checkout: "bg-purple-100 text-purple-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-zinc-100 text-zinc-600",
  no_show: "bg-red-100 text-red-700",
};

export type ScheduleItemData = {
  id: string;
  timeLabel: string;
  clientName: string;
  serviceName: string;
  branchName: string;
  status: AppointmentStatus;
  priceCents: number;
  chargeStatus: "none" | "open" | "paid" | "void";
};

export function ScheduleItem({ item }: { item: ScheduleItemData }) {
  return (
    <article className="rounded-xl border border-border bg-white/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {item.timeLabel} · {item.clientName}
          </p>
          <p className="mt-0.5 text-xs text-foreground/50">
            {item.serviceName} · {item.branchName}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLES[item.status]}`}
        >
          {STATUS_LABELS[item.status]}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-sm font-medium text-brand">
          {formatCentsBRL(item.priceCents)}
        </span>
        {item.chargeStatus === "open" && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
            Cobrança aberta
          </span>
        )}
        {item.chargeStatus === "paid" && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">
            Pago
          </span>
        )}
      </div>
    </article>
  );
}
