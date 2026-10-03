"use client";

import { useState, useTransition } from "react";
import { formatCentsBRL } from "@/lib/money";
import { settleChargeAction } from "./actions";
import {
  initialFinanceActionState,
  type Charge,
  type FinanceActionState,
} from "./types";

const STATUS_LABELS: Record<Charge["status"], string> = {
  open: "Aberta",
  paid: "Paga",
  void: "Estornada",
};

const STATUS_STYLES: Record<Charge["status"], string> = {
  open: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  void: "bg-zinc-100 text-zinc-600",
};

export function ChargeList({
  charges,
  canSettle,
}: {
  charges: Charge[];
  canSettle: boolean;
}) {
  const [result, setResult] = useState<FinanceActionState>(
    initialFinanceActionState,
  );
  const [pending, startTransition] = useTransition();

  function settle(id: string) {
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      setResult(await settleChargeAction(initialFinanceActionState, formData));
    });
  }

  if (charges.length === 0) {
    return (
      <p className="text-sm text-foreground/60">
        Nenhuma cobrança registrada ainda.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {charges.map((charge) => (
        <div
          key={charge.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white/60 p-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm">{charge.description}</p>
            <span
              className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLES[charge.status]}`}
            >
              {STATUS_LABELS[charge.status]}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm font-medium">
              {formatCentsBRL(charge.totalCents)}
            </span>
            {canSettle && charge.status === "open" && (
              <button
                type="button"
                onClick={() => settle(charge.id)}
                disabled={pending}
                className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-foreground disabled:opacity-60"
              >
                {pending ? "..." : "Receber"}
              </button>
            )}
          </div>
        </div>
      ))}

      {result.status === "error" && result.message && (
        <p className="text-xs text-red-600">{result.message}</p>
      )}
      {result.status === "success" && result.message && (
        <p className="text-xs text-emerald-700">{result.message}</p>
      )}
    </div>
  );
}
