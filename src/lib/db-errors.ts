// Erros do Postgres vindos das queries. O Drizzle embrulha o erro do driver
// (DrizzleQueryError) e guarda o original em `cause`: o `code` e a mensagem do
// Postgres (constraint, RAISE EXCEPTION) ficam em `cause.cause`, nao no topo.

type MaybeDbError =
  | { code?: unknown; message?: unknown; cause?: { code?: unknown; message?: unknown } }
  | undefined;

/** Codigo SQLSTATE do erro (ex.: "23505"), direto ou embrulhado pelo Drizzle. */
export function dbErrorCode(cause: unknown): string | undefined {
  const err = cause as MaybeDbError;
  const code = err?.code ?? err?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Mensagem do erro somada a do erro do driver, para testes com `.includes()`
 * por nome de constraint ou texto de RAISE EXCEPTION.
 */
export function dbErrorMessage(cause: unknown): string {
  const err = cause as MaybeDbError;
  const outer = cause instanceof Error ? cause.message : String(cause);
  const inner = err?.cause?.message;
  return typeof inner === "string" ? `${outer}\n${inner}` : outer;
}
