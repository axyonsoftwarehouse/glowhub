"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setClientActiveAction, updateClientAction } from "./actions";
import {
  initialClientActionState,
  type Client,
  type ClientActionState,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function ClientCard({ client }: { client: Client }) {
  const [editing, setEditing] = useState(false);
  const [updateResult, setUpdateResult] = useState<ClientActionState>(
    initialClientActionState,
  );
  const [toggleResult, setToggleResult] = useState<ClientActionState>(
    initialClientActionState,
  );
  const [updating, startUpdate] = useTransition();
  const [toggling, startToggle] = useTransition();

  function handleUpdate(formData: FormData) {
    startUpdate(async () => {
      const next = await updateClientAction(initialClientActionState, formData);
      setUpdateResult(next);
      if (next.status === "success") setEditing(false);
    });
  }

  function handleToggle(formData: FormData) {
    startToggle(async () => {
      const next = await setClientActiveAction(
        initialClientActionState,
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
          <h3 className="font-medium">
            <Link
              href={`/clients/${client.id}`}
              className="hover:text-brand hover:underline"
            >
              {client.name}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-foreground/50">
            {client.phone ?? "sem telefone"}
            {client.email ? ` · ${client.email}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
            client.isActive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {client.isActive ? "Ativo" : "Inativo"}
        </span>
      </div>

      {!editing && client.notes && (
        <p className="mt-3 text-sm text-foreground/70">{client.notes}</p>
      )}

      {editing && (
        <form action={handleUpdate} className="mt-4 space-y-3">
          <input type="hidden" name="id" value={client.id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <input name="name" defaultValue={client.name} className={inputClass} />
            <input name="email" defaultValue={client.email ?? ""} className={inputClass} />
            <input name="phone" defaultValue={client.phone ?? ""} className={inputClass} />
          </div>
          {e.name?.[0] && <p className="text-xs text-red-600">{e.name[0]}</p>}
          {e.email?.[0] && <p className="text-xs text-red-600">{e.email[0]}</p>}
          <textarea
            name="notes"
            rows={2}
            defaultValue={client.notes ?? ""}
            className={inputClass}
          />
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

      {!editing && (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Editar
          </button>
          <form action={handleToggle}>
            <input type="hidden" name="id" value={client.id} />
            <input type="hidden" name="is_active" value={String(!client.isActive)} />
            <button
              type="submit"
              disabled={toggling}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              {toggling ? "..." : client.isActive ? "Desativar" : "Ativar"}
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
