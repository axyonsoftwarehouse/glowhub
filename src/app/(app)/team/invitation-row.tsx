"use client";

import { useState, useTransition } from "react";
import { revokeInvitationAction } from "./actions";
import {
  initialTeamActionState,
  ROLE_LABELS,
  type Invitation,
} from "./types";

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function InvitationRow({ invitation }: { invitation: Invitation }) {
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState(initialTeamActionState);
  const [pending, startTransition] = useTransition();

  const path = `/invite/${invitation.token}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function revoke() {
    const formData = new FormData();
    formData.set("id", invitation.id);
    startTransition(async () => {
      const next = await revokeInvitationAction(initialTeamActionState, formData);
      setResult(next);
    });
  }

  return (
    <article className="rounded-xl border border-border bg-white/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{invitation.email}</p>
          <p className="mt-0.5 text-xs text-foreground/70">
            {ROLE_LABELS[invitation.role] ?? invitation.role} · expira em{" "}
            {formatDate(invitation.expiresAt)}
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">
          Pendente
        </span>
      </div>

      <p className="mt-3 truncate rounded-lg bg-muted px-2 py-1 font-mono text-[11px] text-foreground/60">
        {path}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={copyLink}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          {copied ? "Copiado!" : "Copiar link"}
        </button>
        <button
          type="button"
          onClick={revoke}
          disabled={pending}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-muted disabled:opacity-60"
        >
          {pending ? "Revogando..." : "Revogar"}
        </button>
      </div>

      {result.status === "error" && result.message && (
        <p className="mt-2 text-xs text-red-600">{result.message}</p>
      )}
    </article>
  );
}
