"use client";

import { useState, useTransition } from "react";
import { addWalletCreditAction } from "@/app/(app)/finance/actions";
import { formatCentsBRL } from "@/lib/money";

type WalletClient = { id: string; name: string; balanceCents: number };

const METHODS = [
  { value: "cash", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "debit", label: "Débito" },
  { value: "credit", label: "Crédito" },
];

export function WalletList({
  clients,
  canManage,
}: {
  clients: WalletClient[];
  canManage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addCredit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addWalletCreditAction(
        { status: "idle" },
        formData,
      );
      if (result.status === "error") setError(result.message ?? "Erro.");
    });
  }

  if (clients.length === 0) {
    return (
      <p className="text-sm text-foreground/60">Nenhum cliente cadastrado.</p>
    );
  }

  return (
    <div className="space-y-2">
      {clients.map((client) => (
        <div
          key={client.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white/60 p-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{client.name}</p>
            <p className="text-xs text-foreground/50">
              saldo {formatCentsBRL(client.balanceCents)}
            </p>
          </div>
          {canManage && (
            <form action={addCredit} className="flex shrink-0 items-center gap-2">
              <input type="hidden" name="clientId" value={client.id} />
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
                placeholder="0,00"
                className="w-20 rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-brand"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                {pending ? "..." : "Adicionar"}
              </button>
            </form>
          )}
        </div>
      ))}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
