"use client";

import { ErrorPanel } from "@/components/error-panel";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main id="conteudo" className="flex flex-1 flex-col">
      <ErrorPanel error={error} retry={retry} homeHref="/" homeLabel="Ir para o início" />
    </main>
  );
}
