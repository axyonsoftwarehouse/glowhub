"use client";

import { useRef, useState, useTransition } from "react";
import { createCategoryAction, setCategoryActiveAction } from "./actions";
import {
  initialCatalogActionState,
  type CatalogActionState,
  type Category,
} from "./types";

export function CategoryManager({
  categories,
  canManage,
  kind,
}: {
  categories: Category[];
  canManage: boolean;
  kind: "service" | "product";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [createState, setCreateState] = useState<CatalogActionState>(
    initialCatalogActionState,
  );
  const [toggleState, setToggleState] = useState<CatalogActionState>(
    initialCatalogActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      const next = await createCategoryAction(
        initialCatalogActionState,
        formData,
      );
      setCreateState(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  function handleToggle(id: string, isActive: boolean) {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("is_active", String(isActive));
    startTransition(async () => {
      const next = await setCategoryActiveAction(
        initialCatalogActionState,
        formData,
      );
      setToggleState(next);
    });
  }

  const nameError = createState.fieldErrors?.name?.[0];

  return (
    <section className="rounded-2xl border border-border bg-white/70 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">
        Categorias
      </h2>

      {canManage && (
        <form
          ref={formRef}
          action={handleCreate}
          className="mt-4 flex items-start gap-2"
        >
          <div className="flex-1">
            <input type="hidden" name="kind" value={kind} />
            <input
              name="name"
              placeholder="Cabelo, Unhas, Estética..."
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            {nameError && (
              <p className="mt-1 text-xs text-red-600">{nameError}</p>
            )}
            {createState.status === "error" && createState.message && (
              <p className="mt-1 text-xs text-red-600">{createState.message}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
          >
            Adicionar
          </button>
        </form>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {categories.map((category) => (
          <span
            key={category.id}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
              category.isActive
                ? "border-border bg-white"
                : "border-border bg-muted text-foreground/40"
            }`}
          >
            {category.name}
            {canManage && (
              <button
                type="button"
                onClick={() => handleToggle(category.id, !category.isActive)}
                disabled={pending}
                className="text-[11px] font-medium text-brand hover:underline disabled:opacity-60"
              >
                {category.isActive ? "Desativar" : "Ativar"}
              </button>
            )}
          </span>
        ))}

        {categories.length === 0 && (
          <p className="text-sm text-foreground/60">
            Nenhuma categoria cadastrada ainda.
          </p>
        )}
      </div>

      {toggleState.status === "error" && toggleState.message && (
        <p className="mt-2 text-xs text-red-600">{toggleState.message}</p>
      )}
    </section>
  );
}
