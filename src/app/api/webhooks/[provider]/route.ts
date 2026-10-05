import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { webhookEvents } from "@/db/schema";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Endpoint generico de webhook de pagamento.
 * Cada provedor registra a URL `/api/webhooks/<provider>`. Os eventos sao
 * gravados de forma IDEMPOTENTE (unique provider + event_id); a confirmacao do
 * pagamento deve ser adicionada por provedor, com validacao de assinatura
 * (segredo via env).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  const raw = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = { raw };
  }

  // TODO(provider): validar assinatura (cabecalho do provedor + segredo).
  const eventId =
    request.headers.get("x-webhook-id") ??
    extractEventId(payload) ??
    createHash("sha256").update(raw).digest("hex");

  try {
    const db = getDb();
    const inserted = await db
      .insert(webhookEvents)
      .values({ provider, eventId, payload: payload as object })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });

    if (inserted.length === 0) {
      logger.info("webhook_duplicate", { provider, eventId });
      return Response.json({ received: true, duplicate: true }, { status: 200 });
    }

    // TODO(provider): despachar por provedor para confirmar/estornar o pagamento
    // de forma idempotente e lancar no ledger.
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, inserted[0].id));

    logger.info("webhook_received", { provider, eventId });
    return Response.json({ received: true }, { status: 200 });
  } catch (cause) {
    logger.error("webhook_failed", { provider, eventId, error: String(cause) });
    return Response.json(
      { error: "Falha ao processar webhook.", detail: String(cause) },
      { status: 500 },
    );
  }
}

function extractEventId(payload: unknown): string | null {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["id", "event_id", "eventId"]) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  }
  return null;
}
