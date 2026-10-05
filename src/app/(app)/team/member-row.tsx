"use client";

import { useState, useTransition } from "react";
import {
  removeMemberAction,
  updateMemberRoleAction,
} from "./actions";
import {
  initialTeamActionState,
  MEMBER_ROLES,
  ROLE_LABELS,
  type Member,
  type TeamActionState,
} from "./types";

export function MemberRow({
  member,
  canManage,
  isSelf,
}: {
  member: Member;
  canManage: boolean;
  isSelf: boolean;
}) {
  const [role, setRole] = useState(member.role);
  const [roleResult, setRoleResult] = useState<TeamActionState>(
    initialTeamActionState,
  );
  const [removeResult, setRemoveResult] = useState<TeamActionState>(
    initialTeamActionState,
  );
  const [savingRole, startSaveRole] = useTransition();
  const [removing, startRemove] = useTransition();

  function saveRole() {
    const formData = new FormData();
    formData.set("userId", member.userId);
    formData.set("role", role);
    startSaveRole(async () => {
      setRoleResult(await updateMemberRoleAction(initialTeamActionState, formData));
    });
  }

  function remove() {
    const formData = new FormData();
    formData.set("userId", member.userId);
    startRemove(async () => {
      setRemoveResult(await removeMemberAction(initialTeamActionState, formData));
    });
  }

  const changed = role !== member.role;
  const editable = canManage && !isSelf;

  return (
    <article className="rounded-xl border border-border bg-white/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {member.fullName || "Sem nome"}
            {isSelf && (
              <span className="ml-2 text-xs text-foreground/50">(você)</span>
            )}
          </p>
          {!editable && (
            <p className="mt-0.5 text-xs text-foreground/50">
              {ROLE_LABELS[member.role] ?? member.role}
            </p>
          )}
        </div>
      </div>

      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-brand"
          >
            {MEMBER_ROLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={saveRole}
            disabled={savingRole || !changed}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
          >
            {savingRole ? "Salvando..." : "Salvar papel"}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={removing}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-muted disabled:opacity-60"
          >
            {removing ? "Removendo..." : "Remover"}
          </button>
        </div>
      )}

      {roleResult.status === "error" && roleResult.message && (
        <p className="mt-2 text-xs text-red-600">{roleResult.message}</p>
      )}
      {roleResult.status === "success" && (
        <p className="mt-2 text-xs text-emerald-700">Papel atualizado.</p>
      )}
      {removeResult.status === "error" && removeResult.message && (
        <p className="mt-2 text-xs text-red-600">{removeResult.message}</p>
      )}
    </article>
  );
}
