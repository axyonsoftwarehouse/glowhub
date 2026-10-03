"use client";

import { useState, useTransition } from "react";
import { formatCentsBRL, formatCentsToInput } from "@/lib/money";
import { registerPaymentAction } from "./actions";
import {
  initialFinanceActionState,
  type Charge,
  type FinanceActionState,
} from "./types";

const METHODS = [
  { value: "cash", label: "Dinheiro" },
  { value: "debit", label: "Débito" },
  { value: "credit", label: "Crédito" },
  { value: "pix", label: "Pix" },
  { value: "transfer", label: "Transferência" },
  { value: "wallet", label: "Carteira" },
  { value: "other", label: "Outro" },
];

const STATUS_STYLES: Record<Charge["status"], string> = {
  open: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  void: "bg-zinc-100 text-zinc-600",
};

const STATUS_LABELS: Record<Charge["status"], string> = {
  open: "Aberta",
  paid: "Paga",
  void: "Estornada",
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

  function handlePayment(formData: FormData) {
    startTransition(async () => {
      setResult(await registerPaymentAction(initialFinanceActionState, formData));
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
      {charges.map((charge) => {
        const remaining = charge.totalCents - charge.paidCents;
        return (
          <div
            key={charge.id}
            className="rounded-lg border border-border bg-white/60 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm">{charge.description}</p>
                <span
                  className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLES[charge.status]}`}
                >
                  {STATUS_LABELS[charge.status]}
                </span>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium">
                  {formatCentsBRL(charge.totalCents)}
                </p>
                {charge.paidCents > 0 && charge.paidCents < charge.totalCents && (
                  <p className="text-[11px] text-foreground/50">
                    pago {formatCentsBRL(charge.paidCents)} · saldo{" "}
                    {formatCentsBRL(remaining)}
                  </p>
                )}
              </div>
            </div>

            {canSettle && charge.status === "open" && remaining > 0 && (
              <form
                action={handlePayment}
                className="mt-2 flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="chargeId" value={charge.id} />
                <select
                  name="method"
                  defaultValue="cash"
                  className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-brand"
                >
                  {METHODS.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
                <input
                  name="amount"
                  defaultValue={formatCentsToInput(remaining)}
                  className="w-24 rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-brand"
                />
                <input
                  name="tip"
                  placeholder="Gorjeta"
                  className="w-20 rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-brand"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-foreground disabled:opacity-60"
                >
                  {pending ? "..." : "Receber"}
                </button>
              </form>
            )}
          </div>
        );
      })}

      {result.status === "error" && result.message && (
        <p className="text-xs text-red-600">{result.message}</p>
      )}
      {result.status === "success" && result.message && (
        <p className="text-xs text-emerald-700">{result.message}</p>
      )}
    </div>
  );
}
