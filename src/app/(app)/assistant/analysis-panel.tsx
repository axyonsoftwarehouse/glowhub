"use client";

import { useState, useTransition } from "react";
import { SpeakButton } from "@/components/voice";
import { runAnalysisAction } from "./actions";
import type { AnalysisKind } from "@/lib/assistant";

const OPTIONS: { kind: AnalysisKind; label: string; description: string }[] = [
  {
    kind: "today",
    label: "Resumo do dia",
    description: "Agenda, recebimentos e pendências de hoje.",
  },
  {
    kind: "week",
    label: "Resumo da semana",
    description: "Últimos 7 dias e o que vem pela frente.",
  },
  {
    kind: "inactive",
    label: "Clientes inativos",
    description: "Quem não volta há mais de 60 dias.",
  },
  {
    kind: "cash",
    label: "Ocupação e caixa",
    description: "Recebido, a receber, ticket médio e ocupação.",
  },
];

export function AnalysisPanel({ disabled }: { disabled: boolean }) {
  const [result, setResult] = useState<string | null>(null);
  const [active, setActive] = useState<AnalysisKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(kind: AnalysisKind) {
    if (pending || disabled) return;
    setActive(kind);
    setError(null);
    setResult(null);
    setCopied(false);
    startTransition(async () => {
      const response = await runAnalysisAction(kind);
      if (response.status === "success") {
        setResult(response.answer);
      } else {
        setError(response.message);
      }
    });
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <button
            key={option.kind}
            type="button"
            onClick={() => run(option.kind)}
            disabled={disabled || pending}
            className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
              active === option.kind && pending
                ? "border-brand bg-brand/5"
                : "border-border bg-white/70 hover:bg-muted"
            }`}
          >
            <span className="block text-sm font-medium">{option.label}</span>
            <span className="mt-0.5 block text-xs text-foreground/60">
              {option.description}
            </span>
          </button>
        ))}
      </div>

      {pending && (
        <p className="text-xs text-foreground/60">Analisando os dados...</p>
      )}

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-xl border border-border bg-white/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
              Análise
            </p>
            <div className="flex items-center gap-2">
              <SpeakButton text={result} />
              <button
                type="button"
                onClick={copy}
                className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium hover:bg-muted"
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm">{result}</p>
        </div>
      )}

      <p className="text-[11px] text-foreground/50">
        A ocupação é aproximada: considera o horário da filial e não desconta
        bloqueios, feriados ou horários específicos de cada profissional.
      </p>
    </div>
  );
}
