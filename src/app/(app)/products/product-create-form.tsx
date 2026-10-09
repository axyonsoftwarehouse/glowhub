"use client";

import { useRef, useState, useTransition } from "react";
import { createProductAction } from "./actions";
import {
  initialProductActionState,
  type CategoryOption,
  type ProductActionState,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function ProductCreateForm({
  categories,
}: {
  categories: CategoryOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ProductActionState>(
    initialProductActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const next = await createProductAction(initialProductActionState, formData);
      setResult(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  const e = result.fieldErrors ?? {};

  return (
    <details className="rounded-2xl border border-border bg-white/70 p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Novo produto
      </summary>

      <form ref={formRef} action={handleSubmit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-foreground/60" htmlFor="product-name">
              Nome
            </label>
            <input id="product-name" name="name" className={`mt-1 ${inputClass}`} />
            {e.name?.[0] && <p className="mt-1 text-xs text-red-600">{e.name[0]}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60" htmlFor="product-category">
              Categoria
            </label>
            <select
              id="product-category"
              name="categoryId"
              defaultValue=""
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
        </div>

        <div>
          <label className="text-xs font-medium text-foreground/60" htmlFor="product-kind">
            Tipo
          </label>
          <select
            id="product-kind"
            name="kind"
            defaultValue="resale"
            className={`mt-1 ${inputClass}`}
          >
            <option value="resale">Revenda (vendido ao cliente)</option>
            <option value="internal">Insumo interno (consumido em serviços)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground/60" htmlFor="product-description">
            Descrição (opcional)
          </label>
          <textarea
            id="product-description"
            name="description"
            rows={2}
            className={`mt-1 ${inputClass}`}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-foreground/60" htmlFor="product-image">
            Imagem (URL, opcional)
          </label>
          <input id="product-image" name="imageUrl" className={`mt-1 ${inputClass}`} />
          {e.imageUrl?.[0] && (
            <p className="mt-1 text-xs text-red-600">{e.imageUrl[0]}</p>
          )}
        </div>

        <fieldset className="rounded-xl border border-dashed border-border p-3">
          <legend className="px-1 text-xs font-medium text-foreground/60">
            Primeira variação
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-foreground/60" htmlFor="variant-name">
                Nome
              </label>
              <input
                id="variant-name"
                name="variantName"
                placeholder="Padrão"
                className={`mt-1 ${inputClass}`}
              />
              {e.variantName?.[0] && (
                <p className="mt-1 text-xs text-red-600">{e.variantName[0]}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-foreground/60" htmlFor="variant-unit">
                Unidade
              </label>
              <input
                id="variant-unit"
                name="variantUnit"
                placeholder="un / ml / g"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground/60" htmlFor="variant-price">
                Preço (R$)
              </label>
              <input
                id="variant-price"
                name="price"
                placeholder="0,00"
                className={`mt-1 ${inputClass}`}
              />
              {e.price?.[0] && (
                <p className="mt-1 text-xs text-red-600">{e.price[0]}</p>
              )}
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-foreground/60" htmlFor="variant-cost">
                Custo (R$)
              </label>
              <input
                id="variant-cost"
                name="cost"
                placeholder="0,00"
                className={`mt-1 ${inputClass}`}
              />
              {e.cost?.[0] && (
                <p className="mt-1 text-xs text-red-600">{e.cost[0]}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-foreground/60" htmlFor="variant-stock">
                Estoque
              </label>
              <input
                id="variant-stock"
                name="stock"
                type="number"
                min={0}
                defaultValue={0}
                className={`mt-1 ${inputClass}`}
              />
              {e.stock?.[0] && (
                <p className="mt-1 text-xs text-red-600">{e.stock[0]}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-foreground/60" htmlFor="variant-min">
                Estoque mínimo
              </label>
              <input
                id="variant-min"
                name="minStock"
                type="number"
                min={0}
                defaultValue={0}
                className={`mt-1 ${inputClass}`}
              />
              {e.minStock?.[0] && (
                <p className="mt-1 text-xs text-red-600">{e.minStock[0]}</p>
              )}
            </div>
          </div>
        </fieldset>

        {result.status === "error" && result.message && (
          <p className="text-sm text-red-600">{result.message}</p>
        )}
        {result.status === "success" && result.message && (
          <p className="text-sm text-emerald-700">{result.message}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Criar produto"}
        </button>
      </form>
    </details>
  );
}
