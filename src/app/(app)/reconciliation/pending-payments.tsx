"use client";

import { useState, useTransition } from "react";
import { formatCentsBRL } from "@/lib/money";
import { confirmPaymentAction } from "./actions";
import {
  initialReconcileState,
  type PaymentRow,
  type ReconcileState,
} from "./types";

const METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
  pix: "Pix",
  transfer: "Transferência",
  wallet: "Carteira",
  other: "Outro",
};

export function PendingPayments({ payments }: { payments: PaymentRow[] }) {
  const [result, setResult] = useState<ReconcileState>(initialReconcileState);
  const [pending, startTransition] = useTransition();

  function confirm(formData: FormData) {
    startTransition(async () => {
      setResult(await confirmPaymentAction(initialReconcileState, formData));
    });
  }

  if (payments.length === 0) {
    return (
      <p className="text-sm text-foreground/60">
        Nada pendente de conciliação. Tudo casado entre cobrança e recebimento. ✅
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {payments.map((payment) => (
        <div
          key={payment.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {payment.chargeDescription}
            </p>
            <p className="text-xs text-foreground/60">
              {METHOD_LABELS[payment.method] ?? payment.method} ·{" "}
              {payment.provider ?? "gateway"}
              {payment.providerRef ? ` · ${payment.providerRef}` : ""} · aguardando
              confirmação
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm font-medium">
              {formatCentsBRL(payment.amountCents)}
            </span>
            <form action={confirm}>
              <input type="hidden" name="paymentId" value={payment.id} />
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-foreground disabled:opacity-60"
              >
                {pending ? "..." : "Confirmar conciliação"}
              </button>
            </form>
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
