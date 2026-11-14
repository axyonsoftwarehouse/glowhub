"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { SpeakButton } from "@/components/voice";
import { formatCentsBRL } from "@/lib/money";
import type { ReceiptAnalysis, ReceiptMethod } from "@/lib/assistant";
import { analyzeReceiptAction } from "./actions";

const METHOD_LABELS: Record<ReceiptMethod, string> = {
  pix: "Pix",
  credit: "Cartão de crédito",
  debit: "Cartão de débito",
  cash: "Dinheiro",
  transfer: "Transferência",
  other: "Outro",
};

const CONFIDENCE_LABELS = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
} as const;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Envie uma imagem (PNG, JPG ou WebP)."));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error("Imagem muito grande. Use uma foto de até 10 MB."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () =>
        reject(new Error("Não foi possível abrir a imagem."));
      image.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Navegador sem suporte para processar a imagem."));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
        if (dataUrl.length > 1_000_000) {
          reject(
            new Error(
              "A imagem ficou grande demais. Tire uma foto mais próxima do comprovante.",
            ),
          );
          return;
        }
        resolve(dataUrl);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function receiptSummary(analysis: ReceiptAnalysis): string {
  const receipt = analysis.receipt;
  const parts = [
    `Valor: ${receipt.amountCents !== null ? formatCentsBRL(receipt.amountCents) : "não identificado"}.`,
    receipt.date ? `Data: ${receipt.date}.` : "",
    receipt.payer ? `Pagador: ${receipt.payer}.` : "",
    receipt.method ? `Forma: ${METHOD_LABELS[receipt.method]}.` : "",
    receipt.reference ? `Referência: ${receipt.reference}.` : "",
    `Confiança: ${CONFIDENCE_LABELS[receipt.confidence]}.`,
  ];
  return parts.filter(Boolean).join(" ");
}

export function ReceiptPanel({ disabled }: { disabled: boolean }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ReceiptAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setAnalysis(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      setPreview(dataUrl);
      setFileName(file.name);
    } catch (cause) {
      setPreview(null);
      setFileName(null);
      setError(cause instanceof Error ? cause.message : "Arquivo inválido.");
    }
  }

  function analyze() {
    if (!preview || pending || disabled) return;
    setError(null);
    startTransition(async () => {
      const response = await analyzeReceiptAction(preview);
      if (response.status === "success") {
        setAnalysis(response.analysis);
      } else {
        setError(response.message);
      }
    });
  }

  function reset() {
    setPreview(null);
    setFileName(null);
    setAnalysis(null);
    setError(null);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-white/70 p-4">
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
        <label className="block text-sm font-medium" htmlFor="receipt-file">
          Foto ou print do comprovante
        </label>
        <p className="mt-1 text-xs text-foreground/60">
          Pix ou cartão. A imagem é comprimida antes do envio.
        </p>
        <input
          id="receipt-file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          capture="environment"
          disabled={disabled || pending}
          onChange={(event) => onFile(event.target.files?.[0])}
          className="mt-3 block w-full text-sm text-foreground/70 file:mr-3 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-foreground"
        />
        {fileName && (
          <p className="mt-2 truncate text-xs text-foreground/60">{fileName}</p>
        )}
      </div>

      {preview && (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Prévia do comprovante"
            className="max-h-64 w-full object-contain"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={analyze}
          disabled={disabled || pending || !preview}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Lendo comprovante..." : "Ler comprovante"}
        </button>
        {(preview || analysis) && (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            Nova leitura
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {analysis && (
        <div className="space-y-4 rounded-xl border border-border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
              Dados encontrados
            </p>
            <div className="flex items-center gap-2">
              <SpeakButton text={receiptSummary(analysis)} label="Ouvir resumo" />
            </div>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-foreground/60">Valor</dt>
              <dd className="font-medium">
                {analysis.receipt.amountCents !== null
                  ? formatCentsBRL(analysis.receipt.amountCents)
                  : "Não identificado"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-foreground/60">Data</dt>
              <dd className="font-medium">
                {analysis.receipt.date ?? "Não identificada"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-foreground/60">Pagador</dt>
              <dd className="font-medium">
                {analysis.receipt.payer ?? "Não identificado"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-foreground/60">Forma</dt>
              <dd className="font-medium">
                {analysis.receipt.method
                  ? METHOD_LABELS[analysis.receipt.method]
                  : "Não identificada"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-foreground/60">Referência</dt>
              <dd className="font-medium">
                {analysis.receipt.reference ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-foreground/60">Confiança</dt>
              <dd className="font-medium">
                {CONFIDENCE_LABELS[analysis.receipt.confidence]}
              </dd>
            </div>
          </dl>

          {analysis.receipt.notes && (
            <p className="rounded-lg bg-muted/50 p-2 text-xs text-foreground/70">
              {analysis.receipt.notes}
            </p>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
              Cobranças em aberto compatíveis
            </p>
            {analysis.candidates.length === 0 ? (
              <p className="mt-2 text-sm text-foreground/60">
                Nenhuma cobrança em aberto encontrada. Registre o recebimento
                manualmente no Financeiro.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {analysis.candidates.map((candidate) => (
                  <li
                    key={candidate.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">
                        {candidate.clientName ?? "Cliente"}
                      </span>
                      <span className="text-foreground/60">
                        {" "}
                        · {candidate.description}
                      </span>
                    </span>
                    <span className="font-medium">
                      {formatCentsBRL(candidate.totalCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/finance"
              className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
            >
              Abrir Financeiro
            </Link>
            <span className="self-center text-xs text-foreground/60">
              Nada é registrado automaticamente: confirme o pagamento no
              Financeiro.
            </span>
          </div>
        </div>
      )}

      <p className="text-[11px] text-foreground/50">
        A imagem é enviada ao provedor de IA apenas para leitura e não é
        armazenada pelo GlowHub. Confira os dados antes de confirmar qualquer
        recebimento.
      </p>
    </div>
  );
}
