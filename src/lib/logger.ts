type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function write(level: LogLevel, message: string, context?: LogContext) {
  const entry = JSON.stringify({
    ...context,
    level,
    message,
    time: new Date().toISOString(),
  });

  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

/**
 * Logger estruturado (JSON) para observabilidade in-app. Sem dependencia de
 * servico externo; a saida vai para stdout/stderr e e coletada pela Vercel.
 */
export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) =>
    write("error", message, context),
};
