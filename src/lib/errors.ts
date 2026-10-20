import { sendAlert } from "@/lib/alerts";
import { dbErrorMessage } from "@/lib/db-errors";
import { recordMetric } from "@/lib/metrics";

const GENERIC_ERROR_MESSAGE = "Ocorreu um erro inesperado. Tente novamente.";

/**
 * Registra o erro no servidor e devolve uma mensagem generica ao cliente.
 *
 * Use em server actions no lugar de retornar `String(cause)` diretamente: o
 * erro cru do Postgres/Neon expoe nomes de tabela, constraint e policy.
 */
export function internalError(cause: unknown): string {
  const raw = dbErrorMessage(cause);
  if (raw.includes("tenant_read_only")) {
    return "Ambiente de demonstração: esta ação está desabilitada (somente leitura).";
  }
  recordMetric("server_error");
  sendAlert({ level: "error", title: "server_error", context: { error: raw } });
  return GENERIC_ERROR_MESSAGE;
}
