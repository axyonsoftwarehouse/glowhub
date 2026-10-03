"use client";

import { useRef, useState, useTransition } from "react";
import { createServiceAction } from "./actions";
import {
  initialCatalogActionState,
  type CatalogActionState,
  type Category,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function ServiceCreateForm({ categories }: { categories: Category[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<CatalogActionState>(
    initialCatalogActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const next = await createServiceAction(initialCatalogActionState, formData);
      setResult(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  const nameError = result.fieldErrors?.name?.[0];
  const categoryError = result.fieldErrors?.categoryId?.[0];
  const durationError = result.fieldErrors?.durationMinutes?.[0];
  const priceError = result.fieldErrors?.price?.[0];
  const imageError = result.fieldErrors?.imageUrl?.[0];

  return (
    <details className="rounded-2xl border border-border bg-white/70 p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Novo serviço
      </summary>

      <form ref={formRef} action={handleSubmit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-foreground/60" htmlFor="service-name">
              Nome
            </label>
            <input
              id="service-name"
              name="name"
              placeholder="Corte feminino"
              className={`mt-1 ${inputClass}`}
            />
            {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60" htmlFor="service-category">
              Categoria
            </label>
            <select
              id="service-category"
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
            {categoryError && (
              <p className="mt-1 text-xs text-red-600">{categoryError}</p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-foreground/60" htmlFor="service-duration">
              Duração (min)
            </label>
            <input
              id="service-duration"
              name="durationMinutes"
              type="number"
              min={1}
              max={1440}
              defaultValue={30}
              className={`mt-1 ${inputClass}`}
            />
            {durationError && (
              <p className="mt-1 text-xs text-red-600">{durationError}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60" htmlFor="service-price">
              Preço (R$)
            </label>
            <input
              id="service-price"
              name="price"
              placeholder="120,00"
              className={`mt-1 ${inputClass}`}
            />
            {priceError && (
              <p className="mt-1 text-xs text-red-600">{priceError}</p>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground/60" htmlFor="service-description">
            Descrição (opcional)
          </label>
          <textarea
            id="service-description"
            name="description"
            rows={2}
            className={`mt-1 ${inputClass}`}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-foreground/60" htmlFor="service-image">
            Imagem (URL, opcional)
          </label>
          <input
            id="service-image"
            name="imageUrl"
            placeholder="https://..."
            className={`mt-1 ${inputClass}`}
          />
          {imageError && (
            <p className="mt-1 text-xs text-red-600">{imageError}</p>
          )}
        </div>

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
          {pending ? "Salvando..." : "Criar serviço"}
        </button>
      </form>
    </details>
  );
}
