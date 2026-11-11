import type { NextRequest } from "next/server";
import { applyBillingEvent } from "@/lib/billing/service";
import { getBillingProvider } from "@/lib/billing/providers";
import { logger } from "@/lib/logger";
import { recordMetric } from "@/lib/metrics";

/**
 * Webhook da assinatura da plataforma (o salao pagando o GlowHub). Separado de
 * /api/webhooks/[provider], que trata os pagamentos dos clientes do salao.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await params;
  const provider = getBillingProvider(providerId);
  if (!provider || providerId === "mock") {
    return Response.json({ error: "Provedor desconhecido." }, { status: 404 });
  }

  const raw = await request.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }
  const webhookRequest = { headers: request.headers, url: new URL(request.url), payload };

  if (!provider.verifyWebhook(webhookRequest)) {
    logger.warn("billing_webhook_rejected", { provider: providerId });
    recordMetric("billing_webhook_rejected", 1, { provider: providerId });
    return Response.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  try {
    const event = await provider.parseWebhook(webhookRequest);
    const { applied } = await applyBillingEvent(providerId, event);
    logger.info("billing_webhook", { provider: providerId, kind: event.kind, applied });
    return Response.json({ ok: true, applied });
  } catch (cause) {
    logger.error("billing_webhook_failed", {
      provider: providerId,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    recordMetric("billing_webhook_failed", 1, { provider: providerId });
    // 500 faz o provedor reenviar a notificacao mais tarde.
    return Response.json({ error: "Falha ao processar." }, { status: 500 });
  }
}
