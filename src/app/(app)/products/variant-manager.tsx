"use client";

import { useRef, useState, useTransition } from "react";
import { formatCentsBRL, formatCentsToInput } from "@/lib/money";
import {
  createVariantAction,
  setVariantActiveAction,
  updateVariantAction,
} from "./actions";
import {
  initialProductActionState,
  type ProductActionState,
  type ProductVariant,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

function VariantRow({ variant }: { variant: ProductVariant }) {
  const [editing, setEditing] = useState(false);
  const [updateResult, setUpdateResult] = useState<ProductActionState>(
    initialProductActionState,
  );
  const [toggleResult, setToggleResult] = useState<ProductActionState>(
    initialProductActionState,
  );
  const [updating, startUpdate] = useTransition();
  const [toggling, startToggle] = useTransition();

  function handleUpdate(formData: FormData) {
    startUpdate(async () => {
      const next = await updateVariantAction(initialProductActionState, formData);
      setUpdateResult(next);
      if (next.status === "success") setEditing(false);
    });
  }

  function handleToggle(formData: FormData) {
    startToggle(async () => {
      const next = await setVariantActiveAction(
        initialProductActionState,
        formData,
      );
      setToggleResult(next);
    });
  }

  const e = updateResult.fieldErrors ?? {};

  return (
    <div className="rounded-lg border border-border bg-white/60 p-3">
      {!editing ? (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{variant.name}</p>
            <p className="mt-0.5 text-xs text-foreground/70">
              {formatCentsBRL(variant.priceCents)} · estoque {variant.stockQuantity}
              {variant.sku ? ` · ${variant.sku}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                variant.isActive
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {variant.isActive ? "Ativa" : "Inativa"}
            </span>
          </div>
        </div>
      ) : (
        <form action={handleUpdate} className="space-y-2">
          <input type="hidden" name="id" value={variant.id} />
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="name" defaultValue={variant.name} placeholder="Nome" className={inputClass} />
            <input name="sku" defaultValue={variant.sku ?? ""} placeholder="SKU" className={inputClass} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              name="price"
              defaultValue={formatCentsToInput(variant.priceCents)}
              placeholder="Preço"
              className={inputClass}
            />
            <input
              name="stock"
              type="number"
              min={0}
              defaultValue={variant.stockQuantity}
              placeholder="Estoque"
              className={inputClass}
            />
          </div>
          {e.name?.[0] && <p className="text-xs text-red-600">{e.name[0]}</p>}
          {e.price?.[0] && <p className="text-xs text-red-600">{e.price[0]}</p>}
          {e.stock?.[0] && <p className="text-xs text-red-600">{e.stock[0]}</p>}
          {updateResult.status === "error" && updateResult.message && (
            <p className="text-xs text-red-600">{updateResult.message}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={updating}
              className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-foreground disabled:opacity-60"
            >
              {updating ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!editing && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            Editar
          </button>
          <form action={handleToggle}>
            <input type="hidden" name="id" value={variant.id} />
            <input type="hidden" name="is_active" value={String(!variant.isActive)} />
            <button
              type="submit"
              disabled={toggling}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              {toggling ? "..." : variant.isActive ? "Desativar" : "Ativar"}
            </button>
          </form>
        </div>
      )}

      {toggleResult.status === "error" && toggleResult.message && (
        <p className="mt-1 text-xs text-red-600">{toggleResult.message}</p>
      )}
    </div>
  );
}

export function VariantManager({
  productId,
  variants,
}: {
  productId: string;
  variants: ProductVariant[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ProductActionState>(
    initialProductActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const next = await createVariantAction(initialProductActionState, formData);
      setResult(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  const e = result.fieldErrors ?? {};

  return (
    <details className="mt-4 rounded-xl border border-dashed border-border p-3">
      <summary className="cursor-pointer text-xs font-medium text-foreground/60">
        Variações ({variants.length})
      </summary>

      <div className="mt-3 space-y-2">
        {variants.map((variant) => (
          <VariantRow key={variant.id} variant={variant} />
        ))}
      </div>

      <form ref={formRef} action={handleSubmit} className="mt-3 space-y-2">
        <input type="hidden" name="productId" value={productId} />
        <div className="grid gap-2 sm:grid-cols-2">
          <input name="name" placeholder="Nova variação (ex.: 300ml)" className={inputClass} />
          <input name="sku" placeholder="SKU (opcional)" className={inputClass} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input name="price" placeholder="Preço" className={inputClass} />
          <input
            name="stock"
            type="number"
            min={0}
            defaultValue={0}
            placeholder="Estoque"
            className={inputClass}
          />
        </div>
        {e.name?.[0] && <p className="text-xs text-red-600">{e.name[0]}</p>}
        {e.price?.[0] && <p className="text-xs text-red-600">{e.price[0]}</p>}
        {e.stock?.[0] && <p className="text-xs text-red-600">{e.stock[0]}</p>}
        {result.status === "error" && result.message && (
          <p className="text-xs text-red-600">{result.message}</p>
        )}
        {result.status === "success" && result.message && (
          <p className="text-xs text-emerald-700">{result.message}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
        >
          {pending ? "Adicionando..." : "Adicionar variação"}
        </button>
      </form>
    </details>
  );
}
