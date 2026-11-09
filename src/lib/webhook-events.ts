import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm";
import { webhookEvents } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { processPaymentWebhook } from "@/lib/payments/confirm";
import {
  nextWebhookAttemptAt,
  WEBHOOK_MAX_ATTEMPTS,
} from "@/lib/webhook-retry";

type Db = ReturnType<typeof getDb>;

export type WebhookEventRow = {
  id: string;
  provider: string;
  payload: unknown;
  requestUrl: string | null;
  attempts: number;
};

export type DispatchResult =
  | { ok: true; processed: boolean }
  | { ok: false; error: string };

async function markProcessed(
  db: Db,
  event: WebhookEventRow,
): Promise<void> {
  await db
    .update(webhookEvents)
    .set({
      status: "processed",
      processedAt: new Date(),
      attempts: event.attempts + 1,
      lastError: null,
      nextAttemptAt: null,
    })
    .where(eq(webhookEvents.id, event.id));
}

async function markFailed(
  db: Db,
  event: WebhookEventRow,
  error: string,
): Promise<void> {
  const attempts = event.attempts + 1;
  await db
    .update(webhookEvents)
    .set({
      status: "failed",
      processedAt: null,
      attempts,
      lastError: error.slice(0, 500),
      nextAttemptAt: nextWebhookAttemptAt(attempts),
    })
    .where(eq(webhookEvents.id, event.id));
}

/**
 * Aplica um evento já gravado ao ledger. Não revalida assinatura: o endpoint
 * fez isso antes de gravar. Provedores sem adapter apenas são marcados como
 * processados (o evento fica registrado para auditoria).
 */
export async function dispatchWebhookEvent(
  db: Db,
  event: WebhookEventRow,
): Promise<DispatchResult> {
  const adapter = getPaymentProvider(event.provider);
  if (!adapter) {
    await markProcessed(db, event);
    return { ok: true, processed: false };
  }

  try {
    const raw = JSON.stringify(event.payload ?? null);
    const url = new URL(
      event.requestUrl ?? `http://localhost/api/webhooks/${event.provider}`,
    );
    const result = await adapter.parseWebhook({
      request: {
        raw,
        headers: new Headers(),
        url,
        payload: event.payload,
      },
      secret: "",
    });

    await db.transaction((tx) =>
      processPaymentWebhook(tx, { providerId: event.provider, result }),
    );
    await markProcessed(db, event);
    return { ok: true, processed: true };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await markFailed(db, event, message);
    return { ok: false, error: message };
  }
}

/**
 * Drena a fila de webhooks pendentes/falhos que já passaram do próximo
 * agendamento. Usado pelo cron; cada evento é idempotente no ledger.
 */
export async function retryPendingWebhookEvents(
  db: Db,
  params: { now?: Date; limit?: number } = {},
): Promise<{ attempted: number; processed: number; failed: number }> {
  const now = params.now ?? new Date();
  const limit = Math.min(params.limit ?? 20, 100);

  const rows = await db
    .select({
      id: webhookEvents.id,
      provider: webhookEvents.provider,
      payload: webhookEvents.payload,
      requestUrl: webhookEvents.requestUrl,
      attempts: webhookEvents.attempts,
    })
    .from(webhookEvents)
    .where(
      and(
        or(
          eq(webhookEvents.status, "failed"),
          eq(webhookEvents.status, "pending"),
        ),
        isNull(webhookEvents.processedAt),
        lt(webhookEvents.attempts, WEBHOOK_MAX_ATTEMPTS),
        or(
          isNull(webhookEvents.nextAttemptAt),
          lte(webhookEvents.nextAttemptAt, now),
        ),
      ),
    )
    .orderBy(asc(webhookEvents.nextAttemptAt))
    .limit(limit);

  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    const result = await dispatchWebhookEvent(db, row);
    if (result.ok) processed += 1;
    else failed += 1;
  }

  return { attempted: rows.length, processed, failed };
}
