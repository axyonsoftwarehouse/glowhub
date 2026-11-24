import { reportError } from "@/lib/sentry";

type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function write(level: LogLevel, message: string, context?: LogContext) {
  const entry = JSON.stringify(
    {
      ...context,
      level,
      message,
      time: new Date().toISOString(),
    },
    // Error nao serializa em JSON ({}); registra nome e mensagem.
    (_key, value) => (value instanceof Error ? `${value.name}: ${value.message}` : value),
  );

  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

/**
 * Logger estruturado (JSON) para observabilidade in-app. A saida vai para
 * stdout/stderr (coletada pela Vercel); `error` tambem vira issue no Sentry
 * quando NEXT_PUBLIC_SENTRY_DSN esta definido.
 */
export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => {
    write("error", message, context);
    reportError(message, context);
  },
};
