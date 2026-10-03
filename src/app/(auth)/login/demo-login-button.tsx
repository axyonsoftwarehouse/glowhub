"use client";

import { useState, useTransition } from "react";
import { demoLoginAction } from "./demo-actions";

export function DemoLoginButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await demoLoginAction();
      if (result && "error" in result) setError(result.error);
    });
  }

  return (
    <div className="mt-4 text-center">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="w-full rounded-full border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        {pending ? "Entrando..." : "Entrar com conta demo"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
