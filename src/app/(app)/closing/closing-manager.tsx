"use client";

import { useState, useTransition } from "react";
import { formatCentsBRL } from "@/lib/money";
import { closePeriodAction, reopenPeriodAction } from "./actions";
import {
  initialClosingActionState,
  type ClosingActionState,
  type ClosingPeriod,
} from "./types";

const inputClass =
  "rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

const STATUS_LABELS: Record<ClosingPeriod["status"], string> = {
  open: "Reaberto",
  closed: "Fechado",
};

export function ClosingManager({
  periods,
  defaultStart,
  defaultEnd,
  canManage,
}: {
  periods: ClosingPeriod[];
  defaultStart: string;
  defaultEnd: string;
  canManage: boolean;
}) {
  const [result, setResult] = useState<ClosingActionState>(
    initialClosingActionState,
  );
  const [pending, startTransition] = useTransition();

  function close(formData: FormData) {
    startTransition(async () => {
      setResult(await closePeriodAction(initialClosingActionState, formData));
    });
  }

  function reopen(id: string) {
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      setResult(await reopenPeriodAction(initialClosingActionState, formData));
    });
  }

  const startError = result.fieldErrors?.periodStart?.[0];
  const endError = result.fieldErrors?.periodEnd?.[0];

  return (
    <div className="space-y-6">
      {canManage && (
        <section className="rounded-2xl border border-border bg-white/70 p-5">
          <h2 className="text-sm font-semibold">Fechar período</h2>
          <p className="mt-1 text-xs text-foreground/50">
            Lançamentos com data dentro do período fechado passam a ser
            bloqueados. Apenas proprietários e administradores fecham/reabrem.
          </p>
          <form action={close} className="mt-4 flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs font-medium text-foreground/60">
                Início
              </label>
              <input
                type="date"
                name="periodStart"
                defaultValue={defaultStart}
                className={`mt-1 ${inputClass}`}
              />
              {startError && (
                <p className="mt-1 text-xs text-red-600">{startError}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-foreground/60">
                Fim
              </label>
              <input
                type="date"
                name="periodEnd"
                defaultValue={defaultEnd}
                className={`mt-1 ${inputClass}`}
              />
              {endError && <p className="mt-1 text-xs text-red-600">{endError}</p>}
            </div>
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
            >
              {pending ? "Fechando..." : "Fechar período"}
            </button>
          </form>
        </section>
      )}

      {result.status === "error" && result.message && (
        <p className="text-sm text-red-600">{result.message}</p>
      )}
      {result.status === "success" && result.message && (
        <p className="text-sm text-emerald-700">{result.message}</p>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
          Períodos
        </h2>
        <div className="mt-4 space-y-2">
          {periods.map((period) => (
            <article
              key={period.id}
              className="rounded-xl border border-border bg-white/70 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {formatDate(period.periodStart)} → {formatDate(period.periodEnd)}
                  </p>
                  <p className="mt-0.5 text-xs text-foreground/50">
                    {STATUS_LABELS[period.status]}
                    {period.closedAt
                      ? ` · fechado em ${period.closedAt.slice(0, 10)}`
                      : ""}
                  </p>
                </div>
                {canManage && period.status === "closed" && (
                  <button
                    type="button"
                    onClick={() => reopen(period.id)}
                    disabled={pending}
                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-red-600 hover:bg-muted disabled:opacity-60"
                  >
                    Reabrir
                  </button>
                )}
              </div>

              {period.summary && (
                <div className="mt-3 grid gap-2 border-t border-border pt-3 text-xs sm:grid-cols-3">
                  <span className="text-foreground/60">
                    Receitas:{" "}
                    <span className="font-medium text-foreground/80">
                      {formatCentsBRL(period.summary.revenue)}
                    </span>
                  </span>
                  <span className="text-foreground/60">
                    Despesas:{" "}
                    <span className="font-medium text-foreground/80">
                      {formatCentsBRL(period.summary.expense)}
                    </span>
                  </span>
                  <span className="text-foreground/60">
                    Resultado:{" "}
                    <span className="font-medium text-foreground/80">
                      {formatCentsBRL(period.summary.result)}
                    </span>
                  </span>
                </div>
              )}
            </article>
          ))}
          {periods.length === 0 && (
            <p className="text-sm text-foreground/60">
              Nenhum período fechado ainda.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
