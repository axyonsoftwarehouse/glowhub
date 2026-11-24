// Configuracao comum do Sentry (navegador, Node e Edge) e helpers de envio.
// Sem NEXT_PUBLIC_SENTRY_DSN o SDK fica desligado e nada sai do app.
//
// LGPD: a coleta automatica do SDK fica desligada (DATA_COLLECTION), o usuario
// vai so pelo id e chaves sensiveis do contexto sao mascaradas antes do envio.
import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";

type Env = Record<string, string | undefined>;

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|e-?mail|phone|telefone|cpf|cnpj|card|cart[aã]o|otp|^code$/i;

export const REDACTED = "[filtrado]";

/** Taxa de amostragem de traces (0 a 1). Invalida ou ausente = 0 (desligado). */
export function parseSampleRate(value: string | undefined): number {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0;
}

export function sentryEnvironment(env: Env = process.env): string {
  return env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || env.APP_ENV || "production";
}

/** Mascara valores de chaves sensiveis (recursivo, com limite de profundidade). */
export function scrubData<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => scrubData(item, depth + 1)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrubData(item, depth + 1);
  }
  return out as T;
}

/** beforeSend: tira cookies, headers sensiveis, query string e dados extras. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) event.request.headers = scrubData(event.request.headers);
    if (event.request.query_string) event.request.query_string = REDACTED;
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  if (event.extra) event.extra = scrubData(event.extra);
  if (event.contexts) {
    event.contexts = scrubData(event.contexts);
    // O SDK do Next guarda o caminho com a query string (pode ter e-mail etc.).
    const nextjs = event.contexts.nextjs as Record<string, unknown> | undefined;
    if (typeof nextjs?.request_path === "string") {
      nextjs.request_path = nextjs.request_path.split("?")[0];
    }
  }
  return event;
}

/**
 * Coleta automatica desligada (no SDK v11 o padrao e coletar tudo: IP,
 * cookies, headers, corpos, query string e variaveis da stack). O que importa
 * para depurar entra explicitamente (id do usuario, tag do tenant, contexto do
 * logger ja filtrado).
 */
export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} satisfies NonNullable<SentryInitOptions["dataCollection"]>;

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

/** Opcoes de `Sentry.init` compartilhadas entre os runtimes. */
export function sentryOptions(env: Env = process.env) {
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: sentryEnvironment(env),
    dataCollection: DATA_COLLECTION,
    tracesSampleRate: parseSampleRate(env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
    beforeSend: scrubEvent,
  } satisfies SentryInitOptions;
}

/**
 * Envia ao Sentry um erro tratado (que nao chega ao onRequestError). Usado pelo
 * `logger.error`; o titulo do log vira o agrupamento da issue.
 */
export function reportError(message: string, context?: Record<string, unknown>): void {
  try {
    const cause = context?.error;
    const rest = cause instanceof Error ? { ...context, error: undefined } : context;
    const extra = rest ? scrubData(rest) : undefined;
    if (cause instanceof Error) {
      Sentry.captureException(cause, { extra, tags: { log: message }, fingerprint: [message] });
    } else {
      Sentry.captureMessage(message, { level: "error", extra, fingerprint: [message] });
    }
  } catch {
    // Observabilidade nunca derruba a requisicao.
  }
}
