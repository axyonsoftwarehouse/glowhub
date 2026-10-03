"use client";

import { useState, useTransition } from "react";
import { formatCentsBRL, parsePriceToCents } from "@/lib/money";
import { postJournalEntryAction } from "./actions";
import {
  initialFinanceActionState,
  type FinanceActionState,
  type LedgerAccount,
} from "./types";

type DraftLine = {
  accountId: string;
  direction: "debit" | "credit";
  amount: string;
};

const inputClass =
  "rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

function emptyLine(): DraftLine {
  return { accountId: "", direction: "debit", amount: "" };
}

export function JournalForm({ accounts }: { accounts: LedgerAccount[] }) {
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [lines, setLines] = useState<DraftLine[]>([
    { accountId: "", direction: "debit", amount: "" },
    { accountId: "", direction: "credit", amount: "" },
  ]);
  const [result, setResult] = useState<FinanceActionState>(
    initialFinanceActionState,
  );
  const [pending, startTransition] = useTransition();

  const debitTotal = lines
    .filter((line) => line.direction === "debit")
    .reduce((sum, line) => sum + (parsePriceToCents(line.amount) ?? 0), 0);
  const creditTotal = lines
    .filter((line) => line.direction === "credit")
    .reduce((sum, line) => sum + (parsePriceToCents(line.amount) ?? 0), 0);
  const balanced = debitTotal === creditTotal && debitTotal > 0;

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function submit() {
    setResult(initialFinanceActionState);

    const payloadLines: {
      accountId: string;
      direction: "debit" | "credit";
      amountCents: number;
    }[] = [];
    for (const line of lines) {
      if (!line.accountId) {
        setResult({ status: "error", message: "Selecione a conta de cada partida." });
        return;
      }
      const cents = parsePriceToCents(line.amount);
      if (cents === null || cents <= 0) {
        setResult({ status: "error", message: "Informe valores válidos (> 0)." });
        return;
      }
      payloadLines.push({
        accountId: line.accountId,
        direction: line.direction,
        amountCents: cents,
      });
    }

    startTransition(async () => {
      const next = await postJournalEntryAction({
        description,
        occurredAt: new Date(`${occurredAt}T12:00:00Z`).toISOString(),
        lines: payloadLines,
      });
      setResult(next);
      if (next.status === "success") {
        setDescription("");
        setLines([emptyLine(), { ...emptyLine(), direction: "credit" }]);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-white/70 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
        Lançamento manual
      </h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-foreground/60">Descrição</label>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={`mt-1 w-full ${inputClass}`}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/60">Data</label>
          <input
            type="date"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            className={`mt-1 w-full ${inputClass}`}
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {lines.map((line, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <select
              value={line.accountId}
              onChange={(event) => updateLine(index, { accountId: event.target.value })}
              className={`flex-1 ${inputClass}`}
            >
              <option value="">Conta...</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} · {account.name}
                </option>
              ))}
            </select>
            <select
              value={line.direction}
              onChange={(event) =>
                updateLine(index, {
                  direction: event.target.value as "debit" | "credit",
                })
              }
              className={inputClass}
            >
              <option value="debit">Débito</option>
              <option value="credit">Crédito</option>
            </select>
            <input
              value={line.amount}
              onChange={(event) => updateLine(index, { amount: event.target.value })}
              placeholder="0,00"
              className={`w-28 ${inputClass}`}
            />
            {lines.length > 2 && (
              <button
                type="button"
                onClick={() =>
                  setLines((prev) => prev.filter((_, i) => i !== index))
                }
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Remover
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, emptyLine()])}
          className="text-xs font-medium text-brand hover:underline"
        >
          + partida
        </button>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs">
        <span>Débitos: {formatCentsBRL(debitTotal)}</span>
        <span>Créditos: {formatCentsBRL(creditTotal)}</span>
        <span className={balanced ? "text-emerald-700" : "text-amber-700"}>
          {balanced ? "Fecha" : "Não fecha"}
        </span>
      </div>

      {result.status === "error" && result.message && (
        <p className="mt-3 text-sm text-red-600">{result.message}</p>
      )}
      {result.status === "success" && result.message && (
        <p className="mt-3 text-sm text-emerald-700">{result.message}</p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !balanced}
        className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Registrando..." : "Registrar lançamento"}
      </button>
    </section>
  );
}
