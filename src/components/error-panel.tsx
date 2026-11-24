"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

type ErrorPanelProps = {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref: string;
  homeLabel: string;
};

/** Conteudo comum das telas de erro (error.tsx da raiz e do painel). */
export function ErrorPanel({ error, retry, homeHref, homeLabel }: ErrorPanelProps) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-brand">Erro inesperado</p>
      <h1 className="mt-3 text-2xl font-semibold">Algo deu errado por aqui</h1>
      <p className="mt-3 text-foreground/70">
        Não conseguimos carregar esta página. Tente de novo em instantes; se continuar, fale com o
        suporte informando o código abaixo.
      </p>
      {error.digest && (
        <p className="mt-4 font-mono text-xs text-foreground/60">Código: {error.digest}</p>
      )}
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-full bg-brand px-6 py-3 font-medium text-brand-foreground transition hover:opacity-90"
        >
          Tentar de novo
        </button>
        <Link
          href={homeHref}
          className="rounded-full border border-border bg-white/60 px-6 py-3 font-medium transition hover:bg-white"
        >
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
