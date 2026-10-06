import { logger } from "@/lib/logger";

const GENERIC_ERROR_MESSAGE = "Ocorreu um erro inesperado. Tente novamente.";

/**
 * Registra o erro no servidor e devolve uma mensagem generica ao cliente.
 *
 * Use em server actions no lugar de retornar `String(cause)` diretamente: o
 * erro cru do Postgres/Neon expoe nomes de tabela, constraint e policy.
 */
export function internalError(cause: unknown): string {
  logger.error("server_error", {
    error: cause instanceof Error ? cause.message : String(cause),
  });
  return GENERIC_ERROR_MESSAGE;
}
