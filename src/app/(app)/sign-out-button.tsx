"use client";

import { useTransition } from "react";
import { signOutAction } from "./actions";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => signOutAction())}
      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
    >
      {pending ? "Saindo..." : "Sair"}
    </button>
  );
}
