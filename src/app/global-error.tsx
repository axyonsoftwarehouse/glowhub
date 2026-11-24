"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Substitui o layout raiz quando ele proprio falha: sem globals.css nem fontes,
// por isso os estilos ficam inline.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf7fb",
          color: "#1b1220",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
          padding: "16px",
          textAlign: "center",
        }}
      >
        <title>Erro | GlowHub</title>
        <main role="alert" style={{ maxWidth: 420 }}>
          <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            Glow<span style={{ color: "#a21caf" }}>Hub</span>
          </p>
          <h1 style={{ fontSize: 24, margin: "16px 0 8px" }}>Algo deu errado</h1>
          <p style={{ margin: 0, opacity: 0.75, lineHeight: 1.5 }}>
            Não conseguimos carregar o GlowHub agora. Tente de novo em instantes.
          </p>
          {error.digest && (
            <p style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.6, marginTop: 16 }}>
              Código: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 24,
              border: 0,
              borderRadius: 999,
              background: "#a21caf",
              color: "#fff",
              padding: "12px 24px",
              fontSize: 16,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
