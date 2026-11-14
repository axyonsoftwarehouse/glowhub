"use client";

import { useRef, useState, useTransition } from "react";
import {
  initialProfessionalActionState,
  type ProfessionalActionState,
} from "@/app/(app)/professionals/types";
import { createHelperAction } from "./actions";

export function HelperForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ProfessionalActionState>(
    initialProfessionalActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const next = await createHelperAction(
        initialProfessionalActionState,
        formData,
      );
      setResult(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  const nameError = result.fieldErrors?.name?.[0];
  const commissionError = result.fieldErrors?.commission?.[0];

  return (
    <details className="rounded-2xl border border-border bg-white/70 p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Adicionar ajudante
      </summary>
      <p className="mt-2 text-xs text-foreground/60">
        Ajudante eventual não precisa de login. Ele é vinculado aos serviços
        ativos e os valores ficam em uma conta própria.
      </p>

      <form
        ref={formRef}
        action={handleSubmit}
        className="mt-4 flex flex-wrap items-start gap-2"
      >
        <div className="min-w-0 flex-1">
          <input
            aria-label="Nome do ajudante"
            name="name"
            placeholder="Nome do ajudante"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
        </div>
        <div className="w-28">
          <input
            aria-label="Comissão %"
            name="commission"
            inputMode="decimal"
            placeholder="Comissão %"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {commissionError && (
            <p className="mt-1 text-xs text-red-600">{commissionError}</p>
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

      {result.status === "error" && result.message && (
        <p className="mt-2 text-xs text-red-600">{result.message}</p>
      )}
      {result.status === "success" && result.message && (
        <p className="mt-2 text-xs text-emerald-700">{result.message}</p>
      )}
    </details>
  );
}
