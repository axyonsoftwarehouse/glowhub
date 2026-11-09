import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  enqueueUpcomingReminders,
  processDueNotifications,
} from "@/lib/notifications";
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
 * Cron diário de manutenção:
 * 1. reprocessa webhooks de pagamento pendentes/falhos (backoff);
 * 2. enfileira lembretes dos atendimentos das próximas 36h (dedupe);
 * 3. envia as notificações de e-mail vencidas.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const db = getDb();
    const webhooks = await retryPendingWebhookEvents(db, { limit: 20 });
    const reminders = await enqueueUpcomingReminders(db, { windowHours: 36 });
    const notifications = await processDueNotifications(db, { limit: 100 });

    recordMetric("cron_daily", 1, { status: "ok" });
    if (webhooks.failed > 0) recordMetric("webhook_retry_failed", webhooks.failed);
    if (notifications.failed > 0) {
      recordMetric("notification_send_failed", notifications.failed);
    }

    return NextResponse.json({ webhooks, reminders, notifications });
  } catch (cause) {
    recordMetric("cron_daily", 1, { status: "failed" });
    sendAlert({
      level: "error",
      title: "cron_daily_failed",
      context: { error: String(cause) },
    });
    return NextResponse.json({ error: "cron failed" }, { status: 500 });
  }
}
