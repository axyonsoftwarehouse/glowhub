// Erros do Postgres vindos das actions de agendamento.
import { dbErrorCode } from "./db-errors";

export { dbErrorCode };

export const OVERLAP_MESSAGE =
  "Já existe um agendamento nesse horário para o profissional.";

/** Mensagem amigavel para a trava appointments_no_overlap (23P01). */
export function overlapMessage(cause: unknown): string | null {
  return dbErrorCode(cause) === "23P01" ? OVERLAP_MESSAGE : null;
}
