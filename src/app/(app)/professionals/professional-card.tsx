"use client";

import { useState, useTransition } from "react";
import {
  linkProfessionalUserAction,
  setProfessionalActiveAction,
  updateProfessionalAction,
} from "./actions";
import { ProfessionalLinksForm } from "./professional-links-form";
import {
  initialProfessionalActionState,
  type BranchOption,
  type MemberOption,
  type Professional,
  type ProfessionalActionState,
  type ServiceOption,
} from "./types";

export function ProfessionalCard({
  professional,
  branches,
  services,
  members,
  canManage,
}: {
  professional: Professional;
  branches: BranchOption[];
  services: ServiceOption[];
  members: MemberOption[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [updateResult, setUpdateResult] = useState<ProfessionalActionState>(
    initialProfessionalActionState,
  );
  const [toggleResult, setToggleResult] = useState<ProfessionalActionState>(
    initialProfessionalActionState,
  );
  const [linkResult, setLinkResult] = useState<ProfessionalActionState>(
    initialProfessionalActionState,
  );
  const [updating, startUpdate] = useTransition();
  const [toggling, startToggle] = useTransition();
  const [linking, startLink] = useTransition();

  const linkedMember = members.find((m) => m.userId === professional.userId);

  const linkedBranchNames = branches
    .filter((branch) => professional.branchIds.includes(branch.id))
    .map((branch) => branch.name);

  function handleUpdate(formData: FormData) {
    startUpdate(async () => {
      const next = await updateProfessionalAction(
        initialProfessionalActionState,
        formData,
      );
      setUpdateResult(next);
      if (next.status === "success") setEditing(false);
    });
  }

  function handleToggle(formData: FormData) {
    startToggle(async () => {
      const next = await setProfessionalActiveAction(
        initialProfessionalActionState,
        formData,
      );
      setToggleResult(next);
    });
  }

  function handleLink(formData: FormData) {
    startLink(async () => {
      const next = await linkProfessionalUserAction(
        initialProfessionalActionState,
        formData,
      );
      setLinkResult(next);
    });
  }

  const nameError = updateResult.fieldErrors?.name?.[0];
  const commissionError = updateResult.fieldErrors?.commission?.[0];

  return (
    <article className="rounded-2xl border border-border bg-white/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{professional.name}</h3>
          <p className="mt-0.5 text-xs text-foreground/50">
            {professional.serviceIds.length} serviço(s) ·{" "}
            {linkedBranchNames.length} filial(is)
            {professional.commissionBp > 0
              ? ` · comissão ${professional.commissionBp / 100}%`
              : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
            professional.isActive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {professional.isActive ? "Ativo" : "Inativo"}
        </span>
      </div>

      {!editing && linkedBranchNames.length > 0 && (
        <p className="mt-3 text-sm text-foreground/70">
          {linkedBranchNames.join(", ")}
        </p>
      )}

      {canManage ? (
        <form
          action={handleLink}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input
            type="hidden"
            name="professionalId"
            value={professional.id}
          />
          <span className="text-xs font-medium uppercase tracking-wide text-foreground/50">
            Acesso
          </span>
          <select
            name="userId"
            defaultValue={professional.userId ?? ""}
            className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-brand"
          >
            <option value="">Sem acesso vinculado</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={linking}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
          >
            {linking ? "Salvando..." : "Vincular"}
          </button>
          {linkResult.status === "error" && linkResult.message && (
            <span className="text-xs text-red-600">{linkResult.message}</span>
          )}
          {linkResult.status === "success" && (
            <span className="text-xs text-emerald-700">Vinculado.</span>
          )}
        </form>
      ) : (
        linkedMember && (
          <p className="mt-3 text-xs text-foreground/50">
            Acesso: {linkedMember.name}
          </p>
        )
      )}

      {editing && (
        <form action={handleUpdate} className="mt-4 flex items-start gap-2">
          <input type="hidden" name="id" value={professional.id} />
          <div className="flex-1">
            <input
              name="name"
              defaultValue={professional.name}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            {nameError && (
              <p className="mt-1 text-xs text-red-600">{nameError}</p>
            )}
          </div>
          <div className="w-28">
            <input
              name="commission"
              defaultValue={(professional.commissionBp / 100).toString()}
              placeholder="Comissão %"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            {commissionError && (
              <p className="mt-1 text-xs text-red-600">{commissionError}</p>
            )}
          </div>
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
        </form>
      )}

      {canManage && (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Editar
          </button>
          <form action={handleToggle}>
            <input type="hidden" name="id" value={professional.id} />
            <input
              type="hidden"
              name="is_active"
              value={String(!professional.isActive)}
            />
            <button
              type="submit"
              disabled={toggling}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              {toggling
                ? "Alterando..."
                : professional.isActive
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
        <ProfessionalLinksForm
          professional={professional}
          branches={branches}
          services={services}
        />
      )}
    </article>
  );
}
