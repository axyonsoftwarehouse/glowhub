"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CLIENT_SEGMENT_LABELS, formatTags } from "@/lib/crm";
import { formatCentsBRL } from "@/lib/money";
import { setClientActiveAction, updateClientAction } from "./actions";
import {
  initialClientActionState,
  type ClientWithInsights,
  type ClientActionState,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

const SEGMENT_STYLES: Record<string, string> = {
  sem_visitas: "bg-zinc-100 text-zinc-600",
  novo: "bg-sky-100 text-sky-700",
  ativo: "bg-emerald-100 text-emerald-700",
  em_risco: "bg-amber-100 text-amber-700",
  inativo: "bg-red-100 text-red-700",
};

export function ClientCard({ client }: { client: ClientWithInsights }) {
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
          <p className="mt-0.5 text-xs text-foreground/70">
            {client.phone ?? "sem telefone"}
            {client.email ? ` · ${client.email}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${SEGMENT_STYLES[client.insights.segment]}`}
          >
            {CLIENT_SEGMENT_LABELS[client.insights.segment]}
          </span>
          {client.insights.isVip && (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
              VIP
            </span>
          )}
          {!client.isActive && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
              Inativo
            </span>
          )}
        </div>
      </div>

      {!editing && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/70">
          <span>{client.insights.visits} visita(s)</span>
          <span>{formatCentsBRL(client.insights.totalSpentCents)} gastos</span>
          {client.insights.daysSinceLastVisit !== null && (
            <span>última há {client.insights.daysSinceLastVisit} dia(s)</span>
          )}
        </div>
      )}

      {!editing && client.tags && client.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {client.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground/70"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

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
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="birthday"
              type="date"
              defaultValue={client.birthday ?? ""}
              className={inputClass}
            />
            <input
              name="tags"
              defaultValue={formatTags(client.tags)}
              placeholder="Tags (separadas por vírgula)"
              className={inputClass}
            />
          </div>
          {e.birthday?.[0] && <p className="text-xs text-red-600">{e.birthday[0]}</p>}
          <textarea
            name="preferences"
            rows={2}
            defaultValue={client.preferences ?? ""}
            placeholder="Preferências"
            className={inputClass}
          />
          <label className="flex items-center gap-2 text-xs text-foreground/70">
            <input
              type="checkbox"
              name="marketing_opt_in"
              defaultChecked={client.marketingOptIn}
              className="h-4 w-4"
            />
            Aceita receber comunicações e promoções
          </label>
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
