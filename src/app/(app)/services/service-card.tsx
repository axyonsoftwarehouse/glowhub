"use client";

import { useState, useTransition } from "react";
import { formatCentsBRL, formatCentsToInput } from "@/lib/money";
import { setServiceActiveAction, updateServiceAction } from "./actions";
import { ServiceBranchList } from "./service-branch-list";
import {
  initialCatalogActionState,
  type BranchOption,
  type CatalogActionState,
  type Category,
  type Service,
  type ServiceBranchOverride,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function ServiceCard({
  service,
  categories,
  branches,
  overrides,
  canManage,
}: {
  service: Service;
  categories: Category[];
  branches: BranchOption[];
  overrides: ServiceBranchOverride[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [updateResult, setUpdateResult] = useState<CatalogActionState>(
    initialCatalogActionState,
  );
  const [toggleResult, setToggleResult] = useState<CatalogActionState>(
    initialCatalogActionState,
  );
  const [updating, startUpdate] = useTransition();
  const [toggling, startToggle] = useTransition();

  const categoryName =
    categories.find((category) => category.id === service.categoryId)?.name ??
    null;

  function handleUpdate(formData: FormData) {
    startUpdate(async () => {
      const next = await updateServiceAction(initialCatalogActionState, formData);
      setUpdateResult(next);
      if (next.status === "success") setEditing(false);
    });
  }

  function handleToggle(formData: FormData) {
    startToggle(async () => {
      const next = await setServiceActiveAction(
        initialCatalogActionState,
        formData,
      );
      setToggleResult(next);
    });
  }

  const nameError = updateResult.fieldErrors?.name?.[0];
  const categoryError = updateResult.fieldErrors?.categoryId?.[0];
  const durationError = updateResult.fieldErrors?.durationMinutes?.[0];
  const priceError = updateResult.fieldErrors?.price?.[0];
  const imageError = updateResult.fieldErrors?.imageUrl?.[0];

  return (
    <article className="rounded-2xl border border-border bg-white/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{service.name}</h3>
          <p className="mt-0.5 text-xs text-foreground/50">
            {categoryName ?? "Sem categoria"} · {service.durationMinutes} min
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
            service.isActive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {service.isActive ? "Ativo" : "Inativo"}
        </span>
      </div>

      {!editing && (
        <div className="mt-3 space-y-1">
          <p className="text-sm font-medium text-brand">
            {formatCentsBRL(service.priceCents)}
          </p>
          {service.description && (
            <p className="text-sm text-foreground/70">{service.description}</p>
          )}
          {service.imageUrl && (
            <p className="truncate text-xs text-foreground/40">
              {service.imageUrl}
            </p>
          )}
        </div>
      )}

      {editing && (
        <form action={handleUpdate} className="mt-4 space-y-3">
          <input type="hidden" name="id" value={service.id} />
          <div>
            <label className="text-xs font-medium text-foreground/60">Nome</label>
            <input
              name="name"
              defaultValue={service.name}
              className={`mt-1 ${inputClass}`}
            />
            {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60">
              Categoria
            </label>
            <select
              name="categoryId"
              defaultValue={service.categoryId ?? ""}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground/60">
                Duração (min)
              </label>
              <input
                name="durationMinutes"
                type="number"
                min={1}
                max={1440}
                defaultValue={service.durationMinutes}
                className={`mt-1 ${inputClass}`}
              />
              {durationError && (
                <p className="mt-1 text-xs text-red-600">{durationError}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-foreground/60">
                Preço (R$)
              </label>
              <input
                name="price"
                defaultValue={formatCentsToInput(service.priceCents)}
                className={`mt-1 ${inputClass}`}
              />
              {priceError && (
                <p className="mt-1 text-xs text-red-600">{priceError}</p>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60">
              Descrição
            </label>
            <textarea
              name="description"
              rows={2}
              defaultValue={service.description ?? ""}
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60">
              Imagem (URL)
            </label>
            <input
              name="imageUrl"
              defaultValue={service.imageUrl ?? ""}
              className={`mt-1 ${inputClass}`}
            />
            {imageError && (
              <p className="mt-1 text-xs text-red-600">{imageError}</p>
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
            <input type="hidden" name="id" value={service.id} />
            <input
              type="hidden"
              name="is_active"
              value={String(!service.isActive)}
            />
            <button
              type="submit"
              disabled={toggling}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              {toggling
                ? "Alterando..."
                : service.isActive
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
        <ServiceBranchList
          service={service}
          branches={branches}
          overrides={overrides}
        />
      )}
    </article>
  );
}
