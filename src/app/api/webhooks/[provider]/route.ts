import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { webhookEvents } from "@/db/schema";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordMetric } from "@/lib/metrics";
import { sendAlert } from "@/lib/alerts";
import { getPaymentProvider } from "@/lib/payments";
import { processPaymentWebhook } from "@/lib/payments/confirm";

/** Limite de tamanho do corpo (evita payloads gigantes / abuso da tabela). */
const MAX_BODY_BYTES = 256 * 1024;

const PROVIDER_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/**
 * Segredo do provedor: `WEBHOOK_<PROVIDER>_SECRET` (especifico) ou
 * `WEBHOOK_SECRET` (global). Sem segredo configurado, o endpoint rejeita.
 */
function getSecret(provider: string): string | null {
  const specific = `WEBHOOK_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_SECRET`;
  return process.env[specific] ?? process.env.WEBHOOK_SECRET ?? null;
}

/**
 * Verifica HMAC-SHA256 do corpo bruto (fallback para provedores sem adapter).
 * Aceita `sha256=<hex>` ou `<hex>` nos cabecalhos `x-webhook-signature` /
 * `x-signature`. Comparacao em tempo constante.
 */
function verifySignature(
  raw: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const providedHex = signature.includes("=")
    ? signature.slice(signature.indexOf("=") + 1)
    : signature;
  const expected = createHmac("sha256", secret).update(raw).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(providedHex.trim(), "hex");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Endpoint generico de webhook de pagamento. Valida a assinatura antes de
 * gravar; os eventos sao gravados de forma IDEMPOTENTE (unique provider +
 * event_id). Quando ha um adapter registrado para o provedor, o evento e
 * despachado para confirmar/estornar o pagamento de forma idempotente no ledger.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  if (!PROVIDER_RE.test(provider)) {
    return Response.json({ error: "Provedor inválido." }, { status: 404 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload muito grande." }, { status: 413 });
  }

  const secret = getSecret(provider);
  if (!secret) {
    // Sem segredo nao ha como autenticar: nao aceitar eventos (safe by default).
    logger.warn("webhook_not_configured", { provider });
    recordMetric("webhook_event", 1, { provider, status: "not_configured" });
    return Response.json(
      { error: "Webhook não configurado." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = { raw };
  }

  const adapter = getPaymentProvider(provider);
  const webhookRequest = {
    raw,
    headers: request.headers,
    url: new URL(request.url),
    payload,
  };

  const valid = adapter
    ? adapter.verifyWebhook({ request: webhookRequest, secret })
    : verifySignature(
        raw,
        request.headers.get("x-webhook-signature") ??
          request.headers.get("x-signature"),
        secret,
      );
  if (!valid) {
    logger.warn("webhook_invalid_signature", { provider });
    recordMetric("webhook_event", 1, { provider, status: "invalid_signature" });
    return Response.json({ error: "Assinatura inválida." }, { status: 401 });
  }

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
      recordMetric("webhook_event", 1, { provider, status: "duplicate" });
      return Response.json({ received: true, duplicate: true }, { status: 200 });
    }

    if (adapter) {
      const result = await adapter.parseWebhook({
        request: webhookRequest,
        secret,
      });
      await db.transaction((tx) =>
        processPaymentWebhook(tx, { providerId: provider, result }),
      );
    }

    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, inserted[0].id));

    logger.info("webhook_received", { provider, eventId });
    recordMetric("webhook_event", 1, { provider, status: "received" });
    return Response.json({ received: true }, { status: 200 });
  } catch (cause) {
    recordMetric("webhook_event", 1, { provider, status: "failed" });
    sendAlert({
      level: "error",
      title: "webhook_failed",
      context: { provider, eventId, error: String(cause) },
    });
    return Response.json(
      { error: "Falha ao processar webhook." },
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
