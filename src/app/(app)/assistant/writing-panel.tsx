"use client";

import { useState, useTransition } from "react";
import { generateWritingAction } from "./actions";

const KINDS = [
  { value: "whatsapp", label: "Mensagem de WhatsApp" },
  { value: "reply", label: "Resposta a uma cliente" },
  { value: "description", label: "Descrição de serviço" },
  { value: "promotion", label: "Promoção/campanha" },
  { value: "instagram", label: "Legenda para Instagram" },
] as const;

const TONES = [
  { value: "acolhedor", label: "Acolhedor" },
  { value: "simples", label: "Simples e direto" },
  { value: "profissional", label: "Profissional" },
  { value: "divertido", label: "Divertido" },
] as const;

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-60";

export function WritingPanel({ disabled }: { disabled: boolean }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("whatsapp");
  const [tone, setTone] = useState<(typeof TONES)[number]["value"]>("acolhedor");
  const [audience, setAudience] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!context.trim() || pending || disabled) return;
    setError(null);
    setResult(null);
    setCopied(false);
    startTransition(async () => {
      const response = await generateWritingAction({
        kind,
        tone,
        context,
        audience: audience.trim() || undefined,
      });
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
    <div className="space-y-4 rounded-2xl border border-border bg-white/70 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-foreground/60" htmlFor="writing-kind">
            Tipo de texto
          </label>
          <select
            id="writing-kind"
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as (typeof KINDS)[number]["value"])
            }
            disabled={disabled || pending}
            className={`mt-1 ${inputClass}`}
          >
            {KINDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground/60" htmlFor="writing-tone">
            Tom
          </label>
          <select
            id="writing-tone"
            value={tone}
            onChange={(event) =>
              setTone(event.target.value as (typeof TONES)[number]["value"])
            }
            disabled={disabled || pending}
            className={`mt-1 ${inputClass}`}
          >
            {TONES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-foreground/60" htmlFor="writing-audience">
          Público (opcional)
        </label>
        <input
          id="writing-audience"
          value={audience}
          onChange={(event) => setAudience(event.target.value)}
          placeholder="Ex.: clientes que fizeram design há 30 dias"
          disabled={disabled || pending}
          maxLength={200}
          className={`mt-1 ${inputClass}`}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-foreground/60" htmlFor="writing-context">
          O que você quer escrever?
        </label>
        <textarea
          id="writing-context"
          value={context}
          onChange={(event) => setContext(event.target.value)}
          placeholder="Ex.: lembrar a Ana do retorno e oferecer horário quinta às 14h"
          disabled={disabled || pending}
          maxLength={1000}
          rows={4}
          className={`mt-1 resize-y ${inputClass}`}
        />
        <p className="mt-1 text-[11px] text-foreground/50">
          {context.length}/1000
        </p>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={disabled || pending || !context.trim()}
        className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Escrevendo..." : "Gerar texto"}
      </button>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
              Texto gerado
            </p>
            <button
              type="button"
              onClick={copy}
              className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium hover:bg-muted"
            >
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm">{result}</p>
        </div>
      )}
    </div>
  );
}
