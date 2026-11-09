/**
 * Backoff dos webhooks de pagamento (segundos por tentativa).
 * A fila é persistida em `webhook_events`; o processamento é idempotente.
 */
const RETRY_DELAYS_SECONDS = [60, 300, 900, 3_600, 21_600];

export const WEBHOOK_MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;

/**
 * Delay antes da próxima tentativa, dado o número de tentativas já feitas.
 * `null` quando o limite foi atingido (o evento fica `failed` para análise).
 */
export function webhookRetryDelaySeconds(attempts: number): number | null {
  if (attempts <= 0) return null;
  if (attempts >= WEBHOOK_MAX_ATTEMPTS) return null;
  return RETRY_DELAYS_SECONDS[
    Math.min(attempts - 1, RETRY_DELAYS_SECONDS.length - 1)
  ];
}

export function nextWebhookAttemptAt(
  attempts: number,
  now: Date = new Date(),
): Date | null {
  const delay = webhookRetryDelaySeconds(attempts);
  if (delay === null) return null;
  return new Date(now.getTime() + delay * 1_000);
}

export function canRetryWebhook(
  status: "pending" | "processed" | "failed",
  attempts: number,
): boolean {
  return status !== "processed" && attempts < WEBHOOK_MAX_ATTEMPTS;
}
