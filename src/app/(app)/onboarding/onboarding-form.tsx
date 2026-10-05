"use client";

import { useState, useTransition } from "react";
import { createTenantAction } from "./actions";
import {
  initialTenantActionState,
  type TenantActionState,
} from "./types";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function OnboardingForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [result, setResult] = useState<TenantActionState>(
    initialTenantActionState,
  );
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const next = await createTenantAction(initialTenantActionState, formData);
      setResult(next);
    });
  }

  return (
    <form
      action={submit}
      className="rounded-2xl border border-border bg-white/70 p-6"
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-foreground/60" htmlFor="name">
            Nome da empresa
          </label>
          <input
            id="name"
            name="name"
            value={name}
            onChange={(e) => {
              const value = e.target.value;
              setName(value);
              if (!slugEdited) setSlug(slugify(value));
            }}
            placeholder="Salão Bela Vida"
            className={`mt-1 ${inputClass}`}
          />
          {result.fieldErrors?.name?.[0] && (
            <p className="mt-1 text-xs text-red-600">
              {result.fieldErrors.name[0]}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-foreground/60" htmlFor="slug">
            Identificador (URL)
          </label>
          <input
            id="slug"
            name="slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
            placeholder="bela-vida"
            className={`mt-1 font-mono ${inputClass}`}
          />
          <p className="mt-1 text-xs text-foreground/70">
            Usado no endereço público: <span className="font-mono">{slug || "..."}</span>
            .SEU_DOMINIO
          </p>
          {result.fieldErrors?.slug?.[0] && (
            <p className="mt-1 text-xs text-red-600">
              {result.fieldErrors.slug[0]}
            </p>
          )}
        </div>
      </div>

      {result.status === "error" && result.message && (
        <p className="mt-4 text-sm text-red-600">{result.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-full bg-brand px-4 py-2.5 font-medium text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Criando..." : "Criar empresa"}
      </button>
    </form>
  );
}
