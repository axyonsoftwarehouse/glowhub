"use client";

import { useRef, useState, useTransition } from "react";
import { inviteMemberAction } from "./actions";
import {
  initialTeamActionState,
  INVITE_ROLES,
  type TeamActionState,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function InviteForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<TeamActionState>(initialTeamActionState);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const next = await inviteMemberAction(initialTeamActionState, formData);
      setResult(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  const emailError = result.fieldErrors?.email?.[0];
  const roleError = result.fieldErrors?.role?.[0];

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="rounded-2xl border border-border bg-white/70 p-5"
    >
      <h2 className="text-sm font-semibold">Convidar pessoa</h2>
      <p className="mt-1 text-xs text-foreground/50">
        Gere um link de convite e envie para a pessoa. O link expira em 7 dias.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            className="text-xs font-medium text-foreground/60"
            htmlFor="invite-email"
          >
            E-mail
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            placeholder="pessoa@empresa.com"
            className={`mt-1 ${inputClass}`}
          />
          {emailError && (
            <p className="mt-1 text-xs text-red-600">{emailError}</p>
          )}
        </div>
        <div className="sm:w-48">
          <label
            className="text-xs font-medium text-foreground/60"
            htmlFor="invite-role"
          >
            Papel
          </label>
          <select
            id="invite-role"
            name="role"
            defaultValue="staff"
            className={`mt-1 ${inputClass}`}
          >
            {INVITE_ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
          {roleError && <p className="mt-1 text-xs text-red-600">{roleError}</p>}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Gerando..." : "Convidar"}
        </button>
      </div>

      {result.status === "error" && result.message && (
        <p className="mt-3 text-sm text-red-600">{result.message}</p>
      )}
      {result.status === "success" && result.message && (
        <p className="mt-3 text-sm text-emerald-700">{result.message}</p>
      )}
    </form>
  );
}
