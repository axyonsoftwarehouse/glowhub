"use client";

import { ErrorPanel } from "@/components/error-panel";

// Fica dentro do layout do painel: a navegacao continua visivel quando uma
// tela falha.
export default function PanelError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorPanel error={error} retry={retry} homeHref="/dashboard" homeLabel="Voltar ao painel" />;
}
