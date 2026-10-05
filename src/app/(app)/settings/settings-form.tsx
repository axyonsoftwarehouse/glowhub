"use client";

import { useState, useTransition } from "react";
import { updateTenantSettingsAction } from "./actions";
import {
  initialSettingsActionState,
  type SettingsActionState,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-muted disabled:text-foreground/50";

export function SettingsForm({
  cancellationWindowHours,
  noShowFeePercent,
  canEdit,
}: {
  cancellationWindowHours: number;
  noShowFeePercent: number;
  canEdit: boolean;
}) {
  const [result, setResult] = useState<SettingsActionState>(
    initialSettingsActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setResult(
        await updateTenantSettingsAction(initialSettingsActionState, formData),
      );
    });
  }

  const cancellationError =
    result.fieldErrors?.cancellationWindowHours?.[0];
  const noShowError = result.fieldErrors?.noShowFeePercent?.[0];

  return (
    <form
      action={handleSubmit}
      className="rounded-2xl border border-border bg-white/70 p-5"
    >
      <h2 className="text-sm font-semibold">Políticas de agendamento</h2>
      <p className="mt-1 text-xs text-foreground/50">
        Aplica-se a cancelamentos e faltas no painel e na visão do profissional.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="cancellationWindowHours"
            className="text-xs font-medium text-foreground/60"
          >
            Janela mínima de cancelamento (horas)
          </label>
          <input
            id="cancellationWindowHours"
            name="cancellationWindowHours"
            type="number"
            min={0}
            max={168}
            defaultValue={cancellationWindowHours}
            disabled={!canEdit}
            className={`mt-1 ${inputClass}`}
          />
          <p className="mt-1 text-xs text-foreground/40">
            0 = sem restrição. Dentro da janela, só owner/admin/manager cancelam.
          </p>
          {cancellationError && (
            <p className="mt-1 text-xs text-red-600">{cancellationError}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="noShowFeePercent"
            className="text-xs font-medium text-foreground/60"
          >
            Taxa de não comparecimento (% do serviço)
          </label>
          <input
            id="noShowFeePercent"
            name="noShowFeePercent"
            type="number"
            min={0}
            max={100}
            defaultValue={noShowFeePercent}
            disabled={!canEdit}
            className={`mt-1 ${inputClass}`}
          />
          <p className="mt-1 text-xs text-foreground/40">
            Ao marcar um atendimento como “não compareceu”, gera a cobrança da
            taxa via ledger (se ainda não houver cobrança no agendamento).
          </p>
          {noShowError && (
            <p className="mt-1 text-xs text-red-600">{noShowError}</p>
          )}
        </div>
      </div>

      {result.status === "error" && result.message && (
        <p className="mt-3 text-sm text-red-600">{result.message}</p>
      )}
      {result.status === "success" && result.message && (
        <p className="mt-3 text-sm text-emerald-700">{result.message}</p>
      )}

      {canEdit && (
        <button
          type="submit"
          disabled={pending}
          className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
      )}
    </form>
  );
}
