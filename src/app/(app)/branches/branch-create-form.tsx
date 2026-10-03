"use client";

import { useRef, useState, useTransition } from "react";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { createBranchAction } from "./actions";
import {
  initialBranchActionState,
  slugify,
  type BranchActionState,
} from "./types";

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function BranchCreateForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<BranchActionState>(
    initialBranchActionState,
  );
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const next = await createBranchAction(initialBranchActionState, formData);
      setResult(next);
      if (next.status === "success") {
        formRef.current?.reset();
        setName("");
        setSlug("");
        setSlugEdited(false);
      }
    });
  }

  const nameError = result.fieldErrors?.name?.[0];
  const slugError = result.fieldErrors?.slug?.[0];
  const addressError = result.fieldErrors?.address?.[0];
  const timezoneError = result.fieldErrors?.timezone?.[0];

  return (
    <details className="rounded-2xl border border-border bg-white/70 p-5">
      <summary className="cursor-pointer text-sm font-semibold">
        Nova filial
      </summary>

      <form ref={formRef} action={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className="text-xs font-medium text-foreground/60" htmlFor="name">
            Nome
          </label>
          <input
            id="name"
            name="name"
            value={name}
            onChange={(event) => {
              const value = event.target.value;
              setName(value);
              if (!slugEdited) setSlug(slugify(value));
            }}
            placeholder="Unidade Centro"
            className={`mt-1 ${inputClass}`}
          />
          {nameError && <p className="mt-1 text-xs text-red-600">{nameError}</p>}
        </div>

        <div>
          <label className="text-xs font-medium text-foreground/60" htmlFor="slug">
            Identificador
          </label>
          <input
            id="slug"
            name="slug"
            value={slug}
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugEdited(true);
            }}
            placeholder="centro"
            className={`mt-1 font-mono ${inputClass}`}
          />
          {slugError && <p className="mt-1 text-xs text-red-600">{slugError}</p>}
        </div>

        <div>
          <label
            className="text-xs font-medium text-foreground/60"
            htmlFor="address"
          >
            Endereço (opcional)
          </label>
          <input
            id="address"
            name="address"
            placeholder="Rua Exemplo, 100 - Centro"
            className={`mt-1 ${inputClass}`}
          />
          {addressError && (
            <p className="mt-1 text-xs text-red-600">{addressError}</p>
          )}
        </div>

        <div>
          <label
            className="text-xs font-medium text-foreground/60"
            htmlFor="timezone"
          >
            Fuso horário
          </label>
          <select
            id="timezone"
            name="timezone"
            defaultValue="America/Sao_Paulo"
            className={`mt-1 ${inputClass}`}
          >
            {TIMEZONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {timezoneError && (
            <p className="mt-1 text-xs text-red-600">{timezoneError}</p>
          )}
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
          {pending ? "Salvando..." : "Criar filial"}
        </button>
      </form>
    </details>
  );
}
