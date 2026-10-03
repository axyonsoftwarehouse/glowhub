"use client";

import { useRef, useState, useTransition } from "react";
import { createClientAction } from "./actions";
import {
  initialClientActionState,
  type ClientActionState,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function ClientCreateForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ClientActionState>(
    initialClientActionState,
  );
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const next = await createClientAction(initialClientActionState, formData);
      setResult(next);
      if (next.status === "success") formRef.current?.reset();
    });
  }

  const e = result.fieldErrors ?? {};

  return (
    <details className="rounded-2xl border border-border bg-white/70 p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Novo cliente
      </summary>

      <form ref={formRef} action={handleSubmit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-foreground/60" htmlFor="client-name">
              Nome
            </label>
            <input id="client-name" name="name" className={`mt-1 ${inputClass}`} />
            {e.name?.[0] && <p className="mt-1 text-xs text-red-600">{e.name[0]}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60" htmlFor="client-email">
              E-mail
            </label>
            <input id="client-email" name="email" type="email" className={`mt-1 ${inputClass}`} />
            {e.email?.[0] && <p className="mt-1 text-xs text-red-600">{e.email[0]}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/60" htmlFor="client-phone">
              Telefone
            </label>
            <input id="client-phone" name="phone" className={`mt-1 ${inputClass}`} />
            {e.phone?.[0] && <p className="mt-1 text-xs text-red-600">{e.phone[0]}</p>}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/60" htmlFor="client-notes">
            Observações (opcional)
          </label>
          <textarea id="client-notes" name="notes" rows={2} className={`mt-1 ${inputClass}`} />
        </div>

        {result.status === "error" && result.message && (
          <p className="text-sm text-red-600">{result.message}</p>
        )}
        {result.status === "success" && result.message && (
          <p className="text-sm text-emerald-700">{result.message}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Cadastrar cliente"}
        </button>
      </form>
    </details>
  );
}
