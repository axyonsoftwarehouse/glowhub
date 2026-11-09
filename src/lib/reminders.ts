/** Antecedência padrão do lembrete de agendamento. */
export const REMINDER_LEAD_HOURS = 24;

/**
 * Quando o lembrete deve entrar na fila: 24h antes do atendimento. Se esse
 * horário já passou (agendamento em cima da hora), agenda para agora.
 */
export function reminderScheduledFor(
  startsAt: Date,
  now: Date = new Date(),
): Date {
  const target = new Date(
    startsAt.getTime() - REMINDER_LEAD_HOURS * 3_600_000,
  );
  return target > now ? target : new Date(now);
}

/** Chave idempotente do lembrete: um por agendamento. */
export function reminderDedupeKey(appointmentId: string): string {
  return `appointment-reminder-${appointmentId}`;
}

/** Data/hora do atendimento no fuso da filial (para o corpo do e-mail). */
export function formatReminderWhen(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: timezone,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}
