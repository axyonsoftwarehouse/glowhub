// Codigos de erro do Postgres vindos das actions de agendamento. O Drizzle
// embrulha o erro do driver (DrizzleQueryError) e guarda o original em `cause`.

export const OVERLAP_MESSAGE =
  "Já existe um agendamento nesse horário para o profissional.";

export function dbErrorCode(cause: unknown): string | undefined {
  const err = cause as { code?: unknown; cause?: { code?: unknown } } | undefined;
  const code = err?.code ?? err?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

/** Mensagem amigavel para a trava appointments_no_overlap (23P01). */
export function overlapMessage(cause: unknown): string | null {
  return dbErrorCode(cause) === "23P01" ? OVERLAP_MESSAGE : null;
}
