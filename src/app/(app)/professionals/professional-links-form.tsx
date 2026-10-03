"use client";

import { useState, useTransition } from "react";
import { updateProfessionalLinksAction } from "./actions";
import {
  initialProfessionalActionState,
  type BranchOption,
  type Professional,
  type ServiceOption,
} from "./types";

export function ProfessionalLinksForm({
  professional,
  branches,
  services,
}: {
  professional: Professional;
  branches: BranchOption[];
  services: ServiceOption[];
}) {
  const [result, setResult] = useState(initialProfessionalActionState);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const next = await updateProfessionalLinksAction(
        initialProfessionalActionState,
        formData,
      );
      setResult(next);
    });
  }

  return (
    <details className="mt-4 rounded-xl border border-dashed border-border p-3">
      <summary className="cursor-pointer text-xs font-medium text-foreground/60">
        Filiais e serviços ({professional.branchIds.length} filial(is) ·{" "}
        {professional.serviceIds.length} serviço(s))
      </summary>

      <form action={handleSubmit} className="mt-3 space-y-3">
        <input type="hidden" name="professionalId" value={professional.id} />

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Filiais
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {branches.map((branch) => (
              <label
                key={branch.id}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-xs"
              >
                <input
                  type="checkbox"
                  name="branchIds"
                  value={branch.id}
                  defaultChecked={professional.branchIds.includes(branch.id)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                {branch.name}
              </label>
            ))}
            {branches.length === 0 && (
              <p className="text-xs text-foreground/50">
                Nenhuma filial cadastrada.
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Serviços
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {services.map((service) => (
              <label
                key={service.id}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-xs"
              >
                <input
                  type="checkbox"
                  name="serviceIds"
                  value={service.id}
                  defaultChecked={professional.serviceIds.includes(service.id)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                {service.name}
              </label>
            ))}
            {services.length === 0 && (
              <p className="text-xs text-foreground/50">
                Nenhum serviço cadastrado.
              </p>
            )}
          </div>
        </div>

        {result.status === "error" && result.message && (
          <p className="text-xs text-red-600">{result.message}</p>
        )}
        {result.status === "success" && result.message && (
          <p className="text-xs text-emerald-700">{result.message}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar vínculos"}
        </button>
      </form>
    </details>
  );
}
