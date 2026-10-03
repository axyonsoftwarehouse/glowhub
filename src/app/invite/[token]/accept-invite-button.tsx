"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInviteAction } from "./actions";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptInviteAction(token);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={accept}
        disabled={pending}
        className="w-full rounded-full bg-brand px-4 py-2.5 font-medium text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Aceitando..." : "Aceitar convite"}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
