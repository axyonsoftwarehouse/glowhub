"use client";

import { useRef, useState, useTransition } from "react";
import { addClosureAction, removeClosureAction } from "./actions";
import {
  initialScheduleActionState,
  type ClosureItem,
  type ScheduleActionState,
} from "./types";

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatRange(closure: ClosureItem): string {
  const base =
    closure.startDate === closure.endDate
      ? formatDate(closure.startDate)
      : `${formatDate(closure.startDate)} → ${formatDate(closure.endDate)}`;
  if (closure.startTime && closure.endTime) {
    return `${base} · ${closure.startTime.slice(0, 5)}–${closure.endTime.slice(0, 5)}`;
  }
  return `${base} · dia inteiro`;
}

export function ClosureManager({
  branchId,
  closures,
  canManage,
}: {
  branchId: string;
  closures: ClosureItem[];
  canManage: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [addResult, setAddResult] = useState<ScheduleActionState>(
    initialScheduleActionState,
  );
  const [removeResult, setRemoveResult] = useState<ScheduleActionState>(
    initialScheduleActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      const next = await addClosureAction(initialScheduleActionState, formData);
      setAddResult(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  function handleRemove(id: string) {
    const formData = new FormData();
    formData.set("id", id);
    startTransition(async () => {
      const next = await removeClosureAction(
        initialScheduleActionState,
        formData,
      );
      setRemoveResult(next);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-white/70 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
        Bloqueios e feriados
      </h2>

      {canManage && (
        <form ref={formRef} action={handleAdd} className="mt-4 space-y-3">
          <input type="hidden" name="branchId" value={branchId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-foreground/60">
                Data inicial
              </label>
              <input
                type="date"
                name="startDate"
                required
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground/60">
                Data final
              </label>
              <input
                type="date"
                name="endDate"
                required
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-foreground/60">
                Início (opcional)
              </label>
              <input
                type="time"
                name="startTime"
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground/60">
                Fim (opcional)
              </label>
              <input
                type="time"
                name="endTime"
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
          </div>
          <input
            name="reason"
            placeholder="Motivo (feriado, manutenção...)"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {addResult.status === "error" && addResult.message && (
            <p className="text-sm text-red-600">{addResult.message}</p>
          )}
          {addResult.status === "success" && addResult.message && (
            <p className="text-sm text-emerald-700">{addResult.message}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
          >
            Adicionar bloqueio
          </button>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {closures.map((closure) => (
          <div
            key={closure.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white/60 p-3"
          >
            <div className="min-w-0">
              <p className="text-sm">{formatRange(closure)}</p>
              {closure.reason && (
                <p className="text-xs text-foreground/70">{closure.reason}</p>
              )}
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => handleRemove(closure.id)}
                disabled={pending}
                className="shrink-0 text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
              >
                Remover
              </button>
            )}
          </div>
        ))}

        {closures.length === 0 && (
          <p className="text-sm text-foreground/60">Nenhum bloqueio cadastrado.</p>
        )}
      </div>

      {removeResult.status === "error" && removeResult.message && (
        <p className="mt-2 text-xs text-red-600">{removeResult.message}</p>
      )}
    </section>
  );
}
