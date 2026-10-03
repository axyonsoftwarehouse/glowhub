"use client";

import { useState, useTransition } from "react";
import { formatCentsBRL, formatCentsToInput } from "@/lib/money";
import { upsertServiceBranchAction } from "./actions";
import {
  initialCatalogActionState,
  type BranchOption,
  type Service,
  type ServiceBranchOverride,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

export function ServiceBranchList({
  service,
  branches,
  overrides,
}: {
  service: Service;
  branches: BranchOption[];
  overrides: ServiceBranchOverride[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const overrideByBranch = new Map(
    overrides.map((override) => [override.branchId, override]),
  );

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const next = await upsertServiceBranchAction(
        initialCatalogActionState,
        formData,
      );
      if (next.status === "error") {
        setError(
          next.message ??
            next.fieldErrors?.price?.[0] ??
            next.fieldErrors?.durationMinutes?.[0] ??
            "Não foi possível salvar.",
        );
      }
    });
  }

  return (
    <details className="mt-4 rounded-xl border border-dashed border-border p-3">
      <summary className="cursor-pointer text-xs font-medium text-foreground/60">
        Por filial ({overrides.length} ajuste(s))
      </summary>

      <div className="mt-3 space-y-3">
        {branches.map((branch) => {
          const override = overrideByBranch.get(branch.id);
          const offered = override ? override.isActive : true;

          return (
            <form
              key={branch.id}
              action={handleSubmit}
              className="rounded-lg border border-border bg-white/60 p-3"
            >
              <input type="hidden" name="serviceId" value={service.id} />
              <input type="hidden" name="branchId" value={branch.id} />

              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {branch.name}
                </span>
                {override && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
                    personalizado
                  </span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  name="price"
                  inputMode="decimal"
                  placeholder={`Padrão ${formatCentsBRL(service.priceCents)}`}
                  defaultValue={
                    override?.priceCents != null
                      ? formatCentsToInput(override.priceCents)
                      : ""
                  }
                  className={inputClass}
                />
                <input
                  name="durationMinutes"
                  type="number"
                  min={1}
                  max={1440}
                  placeholder={`Padrão ${service.durationMinutes} min`}
                  defaultValue={override?.durationMinutes ?? ""}
                  className={inputClass}
                />
              </div>

              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-foreground/70">
                  <input
                    type="checkbox"
                    name="offer"
                    defaultChecked={offered}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  Oferecido nesta filial
                </label>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                >
                  {pending ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          );
        })}

        {branches.length === 0 && (
          <p className="text-xs text-foreground/60">
            Cadastre uma filial para definir valores por unidade.
          </p>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </details>
  );
}
