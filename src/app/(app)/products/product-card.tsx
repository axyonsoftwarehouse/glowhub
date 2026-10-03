"use client";

import { useState, useTransition } from "react";
import { setProductActiveAction, updateProductAction } from "./actions";
import { VariantManager } from "./variant-manager";
import {
  initialProductActionState,
  type CategoryOption,
  type Product,
  type ProductActionState,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function ProductCard({
  product,
  categories,
  canManage,
}: {
  product: Product;
  categories: CategoryOption[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [updateResult, setUpdateResult] = useState<ProductActionState>(
    initialProductActionState,
  );
  const [toggleResult, setToggleResult] = useState<ProductActionState>(
    initialProductActionState,
  );
  const [updating, startUpdate] = useTransition();
  const [toggling, startToggle] = useTransition();

  const categoryName =
    categories.find((category) => category.id === product.categoryId)?.name ??
    null;

  const totalStock = product.variants.reduce(
    (sum, variant) => sum + variant.stockQuantity,
    0,
  );

  function handleUpdate(formData: FormData) {
    startUpdate(async () => {
      const next = await updateProductAction(initialProductActionState, formData);
      setUpdateResult(next);
      if (next.status === "success") setEditing(false);
    });
  }

  function handleToggle(formData: FormData) {
    startToggle(async () => {
      const next = await setProductActiveAction(
        initialProductActionState,
        formData,
      );
      setToggleResult(next);
    });
  }

  const e = updateResult.fieldErrors ?? {};

  return (
    <article className="rounded-2xl border border-border bg-white/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{product.name}</h3>
          <p className="mt-0.5 text-xs text-foreground/50">
            {categoryName ?? "Sem categoria"} · {product.variants.length} variação(ões)
            {product.variants.length > 0 ? ` · ${totalStock} em estoque` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
            product.isActive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {product.isActive ? "Ativo" : "Inativo"}
        </span>
      </div>

      {!editing && product.description && (
        <p className="mt-3 text-sm text-foreground/70">{product.description}</p>
      )}

      {editing && (
        <form action={handleUpdate} className="mt-4 space-y-3">
          <input type="hidden" name="id" value={product.id} />
          <div>
            <label className="text-xs font-medium text-foreground/60">Nome</label>
            <input
              name="name"
              defaultValue={product.name}
              className={`mt-1 ${inputClass}`}
            />
            {e.name?.[0] && <p className="mt-1 text-xs text-red-600">{e.name[0]}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60">
              Categoria
            </label>
            <select
              name="categoryId"
              defaultValue={product.categoryId ?? ""}
              className={`mt-1 ${inputClass}`}
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {e.categoryId?.[0] && (
              <p className="mt-1 text-xs text-red-600">{e.categoryId[0]}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60">
              Descrição
            </label>
            <textarea
              name="description"
              rows={2}
              defaultValue={product.description ?? ""}
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60">
              Imagem (URL)
            </label>
            <input
              name="imageUrl"
              defaultValue={product.imageUrl ?? ""}
              className={`mt-1 ${inputClass}`}
            />
            {e.imageUrl?.[0] && (
              <p className="mt-1 text-xs text-red-600">{e.imageUrl[0]}</p>
            )}
          </div>

          {updateResult.status === "error" && updateResult.message && (
            <p className="text-sm text-red-600">{updateResult.message}</p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={updating}
              className="rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground disabled:opacity-60"
            >
              {updating ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {canManage && !editing && (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Editar
          </button>
          <form action={handleToggle}>
            <input type="hidden" name="id" value={product.id} />
            <input
              type="hidden"
              name="is_active"
              value={String(!product.isActive)}
            />
            <button
              type="submit"
              disabled={toggling}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              {toggling
                ? "Alterando..."
                : product.isActive
                  ? "Desativar"
                  : "Ativar"}
            </button>
          </form>
        </div>
      )}

      {toggleResult.status === "error" && toggleResult.message && (
        <p className="mt-2 text-xs text-red-600">{toggleResult.message}</p>
      )}

      {canManage && !editing && (
        <VariantManager productId={product.id} variants={product.variants} />
      )}
    </article>
  );
}
