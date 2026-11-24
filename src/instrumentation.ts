import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

export function register() {
  // Mesmo init para Node e Edge (proxy); sem DSN o SDK fica desligado.
  Sentry.init(sentryOptions());
}

// Erros de Server Components, Route Handlers, Server Actions e proxy.
export const onRequestError = Sentry.captureRequestError;
