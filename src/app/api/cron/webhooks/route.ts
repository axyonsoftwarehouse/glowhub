import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { retryPendingWebhookEvents } from "@/lib/webhook-events";
import { recordMetric } from "@/lib/metrics";
import { sendAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const provided = request.headers.get("authorization") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Cron de retry de webhooks de pagamento. Drena `webhook_events` pendentes ou
 * falhos que já passaram do backoff; cada evento é idempotente no ledger.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await retryPendingWebhookEvents(getDb(), { limit: 20 });
    recordMetric("webhook_retry_cron", 1, { status: "ok" });
    if (result.failed > 0) {
      recordMetric("webhook_retry_failed", result.failed);
    }
    return NextResponse.json(result);
  } catch (cause) {
    recordMetric("webhook_retry_cron", 1, { status: "failed" });
    sendAlert({
      level: "error",
      title: "webhook_retry_cron_failed",
      context: { error: String(cause) },
    });
    return NextResponse.json({ error: "cron failed" }, { status: 500 });
  }
}
