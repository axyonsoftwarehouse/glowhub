import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

// Apenas variaveis NEXT_PUBLIC_* chegam ao navegador (inline no build).
Sentry.init(
  sentryOptions({
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  }),
);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
