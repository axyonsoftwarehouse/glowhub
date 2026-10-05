"use client";

import { useState, useTransition } from "react";
import { formatCentsBRL } from "@/lib/money";
import { payProfessionalAction } from "./actions";
import {
  initialFinanceActionState,
  type FinanceActionState,
  type PayoutRow,
} from "./types";

const METHODS = [
  { value: "cash", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "transfer", label: "Transferência" },
  { value: "other", label: "Outro" },
];

export function PayoutList({ rows }: { rows: PayoutRow[] }) {
  const [result, setResult] = useState<FinanceActionState>(
    initialFinanceActionState,
  );
  const [pending, startTransition] = useTransition();

  function pay(formData: FormData) {
    startTransition(async () => {
      setResult(await payProfessionalAction(initialFinanceActionState, formData));
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-foreground/60">
        Nenhum valor pendente de repasse.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <form
          key={row.professionalId}
          action={pay}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white/60 p-3"
        >
          <input type="hidden" name="professionalId" value={row.professionalId} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.professionalName}</p>
            <p className="text-xs text-foreground/70">
              comissão {formatCentsBRL(row.commissionCents)} · gorjeta{" "}
              {formatCentsBRL(row.tipCents)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-medium">
              {formatCentsBRL(row.commissionCents + row.tipCents)}
            </span>
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
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-foreground disabled:opacity-60"
            >
              {pending ? "..." : "Repassar"}
            </button>
          </div>
        </form>
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
