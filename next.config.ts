import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
};

// Upload de source maps so com SENTRY_AUTH_TOKEN (+ SENTRY_ORG/SENTRY_PROJECT);
// sem ele o build segue normal e os erros chegam com o codigo minificado.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  widenClientFileUpload: true,
  // Envia os eventos do navegador pelo proprio dominio (bloqueadores de anuncio
  // costumam barrar *.sentry.io).
  tunnelRoute: "/monitoring",
  telemetry: false,
});
