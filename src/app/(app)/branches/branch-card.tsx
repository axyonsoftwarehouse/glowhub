"use client";

import { useState, useTransition } from "react";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { setBranchActiveAction, updateBranchAction } from "./actions";
import {
  initialBranchActionState,
  type Branch,
  type BranchActionState,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function BranchCard({
  branch,
  canManage,
}: {
  branch: Branch;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [updateResult, setUpdateResult] = useState<BranchActionState>(
    initialBranchActionState,
  );
  const [toggleResult, setToggleResult] = useState<BranchActionState>(
    initialBranchActionState,
  );
  const [updating, startUpdate] = useTransition();
  const [toggling, startToggle] = useTransition();

  function handleUpdate(formData: FormData) {
    startUpdate(async () => {
      const next = await updateBranchAction(initialBranchActionState, formData);
      setUpdateResult(next);
      if (next.status === "success") setEditing(false);
    });
  }

  function handleToggle(formData: FormData) {
    startToggle(async () => {
      const next = await setBranchActiveAction(
        initialBranchActionState,
        formData,
      );
      setToggleResult(next);
    });
  }

  const nameError = updateResult.fieldErrors?.name?.[0];
  const slugError = updateResult.fieldErrors?.slug?.[0];
  const addressError = updateResult.fieldErrors?.address?.[0];
  const timezoneError = updateResult.fieldErrors?.timezone?.[0];

  return (
    <article className="rounded-2xl border border-border bg-white/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{branch.name}</h3>
          <p className="mt-0.5 font-mono text-xs text-foreground/50">
            /{branch.slug}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${
            branch.isActive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {branch.isActive ? "Ativa" : "Inativa"}
        </span>
      </div>

      {!editing && (
        <div className="mt-3 space-y-1 text-sm text-foreground/70">
          {branch.address && <p>{branch.address}</p>}
          <p className="text-xs text-foreground/50">{branch.timezone}</p>
        </div>
      )}

      {editing && (
        <form action={handleUpdate} className="mt-4 space-y-3">
          <input type="hidden" name="id" value={branch.id} />
          <div>
            <label className="text-xs font-medium text-foreground/60">
              Nome
            </label>
            <input
              name="name"
              defaultValue={branch.name}
              className={`mt-1 ${inputClass}`}
            />
            {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60">
              Identificador
            </label>
            <input
              name="slug"
              defaultValue={branch.slug}
              className={`mt-1 font-mono ${inputClass}`}
            />
            {slugError && <p className="mt-1 text-xs text-red-600">{slugError}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60">
              Endereço
            </label>
            <input
              name="address"
              defaultValue={branch.address ?? ""}
              className={`mt-1 ${inputClass}`}
            />
            {addressError && (
              <p className="mt-1 text-xs text-red-600">{addressError}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60">
              Fuso horário
            </label>
            <select
              name="timezone"
              defaultValue={branch.timezone}
              className={`mt-1 ${inputClass}`}
            >
              {TIMEZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {timezoneError && (
              <p className="mt-1 text-xs text-red-600">{timezoneError}</p>
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
            <input type="hidden" name="id" value={branch.id} />
            <input
              type="hidden"
              name="is_active"
              value={String(!branch.isActive)}
            />
            <button
              type="submit"
              disabled={toggling}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              {toggling
                ? "Alterando..."
                : branch.isActive
                  ? "Desativar"
                  : "Ativar"}
            </button>
          </form>
        </div>
      )}

      {toggleResult.status === "error" && toggleResult.message && (
        <p className="mt-2 text-xs text-red-600">{toggleResult.message}</p>
      )}
    </article>
  );
}
