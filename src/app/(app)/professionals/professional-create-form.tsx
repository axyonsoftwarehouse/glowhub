"use client";

import { useRef, useState, useTransition } from "react";
import { createProfessionalAction } from "./actions";
import {
  initialProfessionalActionState,
  type ProfessionalActionState,
} from "./types";

export function ProfessionalCreateForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ProfessionalActionState>(
    initialProfessionalActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const next = await createProfessionalAction(
        initialProfessionalActionState,
        formData,
      );
      setResult(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  const nameError = result.fieldErrors?.name?.[0];

  return (
    <details className="rounded-2xl border border-border bg-white/70 p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Novo profissional
      </summary>

      <form ref={formRef} action={handleSubmit} className="mt-4 flex items-start gap-2">
        <div className="flex-1">
          <input
            name="name"
            placeholder="Nome do profissional"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
          {result.status === "error" && result.message && (
            <p className="mt-1 text-xs text-red-600">{result.message}</p>
          )}
          {result.status === "success" && result.message && (
            <p className="mt-1 text-xs text-emerald-700">{result.message}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Adicionar"}
        </button>
      </form>
    </details>
  );
}
