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
  const [solo, setSolo] = useState(false);
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

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
          <input
            type="checkbox"
            name="solo"
            checked={solo}
            onChange={(event) => setSolo(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          <span>
            <span className="block text-sm font-medium">Trabalho sozinho</span>
            <span className="mt-0.5 block text-xs text-foreground/70">
              Cria seu profissional, um serviço inicial, horário seg–sáb e o
              plano de contas. Você pode ajustar tudo depois.
            </span>
          </span>
        </label>

        {solo && (
          <div className="space-y-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">
              Seu atendimento inicial
            </p>
            <div>
              <label
                htmlFor="serviceName"
                className="text-xs font-medium text-foreground/60"
              >
                Serviço principal
              </label>
              <input
                id="serviceName"
                name="serviceName"
                defaultValue="Atendimento"
                className={`mt-1 ${inputClass}`}
              />
              {result.fieldErrors?.serviceName?.[0] && (
                <p className="mt-1 text-xs text-red-600">
                  {result.fieldErrors.serviceName[0]}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="serviceDuration"
                  className="text-xs font-medium text-foreground/60"
                >
                  Duração (min)
                </label>
                <input
                  id="serviceDuration"
                  name="serviceDuration"
                  type="number"
                  min={5}
                  max={480}
                  defaultValue={30}
                  className={`mt-1 ${inputClass}`}
                />
                {result.fieldErrors?.serviceDuration?.[0] && (
                  <p className="mt-1 text-xs text-red-600">
                    {result.fieldErrors.serviceDuration[0]}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="servicePrice"
                  className="text-xs font-medium text-foreground/60"
                >
                  Preço (R$)
                </label>
                <input
                  id="servicePrice"
                  name="servicePrice"
                  inputMode="decimal"
                  placeholder="0,00"
                  className={`mt-1 ${inputClass}`}
                />
                {result.fieldErrors?.servicePrice?.[0] && (
                  <p className="mt-1 text-xs text-red-600">
                    {result.fieldErrors.servicePrice[0]}
                  </p>
                )}
              </div>
            </div>
            <p className="text-[11px] text-foreground/60">
              Horário inicial: segunda a sexta 9h–18h e sábado 9h–13h. Ajuste em
              Horários depois.
            </p>
          </div>
        )}
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
