"use client";

import { useRef, useState, useTransition } from "react";
import { formatCentsBRL } from "@/lib/money";
import { addServiceMaterialAction, removeServiceMaterialAction } from "./actions";
import {
  initialCatalogActionState,
  type CatalogActionState,
  type InsumoOption,
  type ServiceMaterial,
} from "./types";

const inputClass =
  "rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

export function ServiceMaterials({
  serviceId,
  materials,
  insumos,
}: {
  serviceId: string;
  materials: ServiceMaterial[];
  insumos: InsumoOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<CatalogActionState>(
    initialCatalogActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleAdd(formData: FormData) {
    startTransition(async () => {
      const next = await addServiceMaterialAction(
        initialCatalogActionState,
        formData,
      );
      setResult(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  function handleRemove(formData: FormData) {
    startTransition(async () => {
      const next = await removeServiceMaterialAction(
        initialCatalogActionState,
        formData,
      );
      setResult(next);
    });
  }

  const costByVariant = new Map(
    insumos.map((insumo) => [insumo.variantId, insumo.costCents]),
  );
  const totalCost = materials.reduce(
    (sum, material) =>
      sum + material.quantity * (costByVariant.get(material.variantId) ?? 0),
    0,
  );

  return (
    <details className="mt-3 rounded-xl border border-dashed border-border p-3">
      <summary className="cursor-pointer text-xs font-medium text-foreground/60">
        Ficha técnica — insumos ({materials.length})
        {totalCost > 0 ? ` · custo ${formatCentsBRL(totalCost)}` : ""}
      </summary>

      <div className="mt-3 space-y-1">
        {materials.map((material) => (
          <div
            key={material.id}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span>
              {material.quantity} {material.unit} · {material.label}
            </span>
            <form action={handleRemove}>
              <input type="hidden" name="id" value={material.id} />
              <button
                type="submit"
                disabled={pending}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-60"
              >
                remover
              </button>
            </form>
          </div>
        ))}
        {materials.length === 0 && (
          <p className="text-xs text-foreground/60">Sem insumos vinculados.</p>
        )}
      </div>

      {insumos.length > 0 ? (
        <form
          ref={formRef}
          action={handleAdd}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="serviceId" value={serviceId} />
          <select name="variantId" defaultValue="" className={inputClass}>
            <option value="" disabled>
              Selecione o insumo
            </option>
            {insumos.map((insumo) => (
              <option key={insumo.variantId} value={insumo.variantId}>
                {insumo.label} ({insumo.unit})
              </option>
            ))}
          </select>
          <input
            name="quantity"
            type="number"
            min={1}
            defaultValue={1}
            aria-label="Quantidade do insumo"
            className={`${inputClass} w-20`}
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
          >
            Adicionar
          </button>
        </form>
      ) : (
        <p className="mt-2 text-xs text-foreground/60">
          Cadastre produtos do tipo “Insumo interno” em Produtos para usar a
          ficha técnica.
        </p>
      )}

      {result.status === "error" && result.message && (
        <p className="mt-2 text-xs text-red-600">{result.message}</p>
      )}
    </details>
  );
}
