"use client";

import { useState, useTransition } from "react";
import { formatCentsBRL } from "@/lib/money";
import {
  simulateMockPaymentAction,
  type MockPaymentState,
} from "./actions";

export function MockCheckout({
  providerRef,
  amountCents,
}: {
  providerRef: string;
  amountCents: number;
}) {
  const [result, setResult] = useState<MockPaymentState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  function submit(decision: "approved" | "rejected") {
    const formData = new FormData();
    formData.set("ref", providerRef);
    formData.set("decision", decision);
    startTransition(async () => {
      setResult(await simulateMockPaymentAction({ status: "idle" }, formData));
    });
  }

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-border bg-white/80 p-6">
      <p className="text-xs uppercase tracking-widest text-brand">
        Checkout (mock)
      </p>
      <h1 className="mt-2 text-xl font-semibold">
        {amountCents > 0 ? formatCentsBRL(amountCents) : "Pagamento"}
      </h1>
      <p className="mt-1 text-sm text-foreground/60">
        Ambiente de demonstração. Simule a resposta do provedor de pagamento.
      </p>
      <p className="mt-2 break-all font-mono text-[11px] text-foreground/50">
        ref: {providerRef}
      </p>

      {result.status === "done" ? (
        <p className="mt-4 text-sm font-medium text-emerald-700">
          {result.message}
        </p>
      ) : (
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => submit("approved")}
            disabled={pending}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
          >
            {pending ? "..." : "Aprovar pagamento"}
          </button>
          <button
            type="button"
            onClick={() => submit("rejected")}
            disabled={pending}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            Recusar
          </button>
        </div>
      )}
      {result.message && result.status !== "done" && (
        <p className="mt-3 text-sm text-red-600">{result.message}</p>
      )}
    </div>
  );
}
