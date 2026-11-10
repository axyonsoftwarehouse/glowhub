import { eq } from "drizzle-orm";
import { pushTokens } from "@/db/schema";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordMetric } from "@/lib/metrics";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/** Formato de token aceito pelo Expo Push Service. */
export function isExpoPushToken(value: string): boolean {
  return TOKEN_RE.test(value.trim());
}

/**
 * Envia push para todos os aparelhos registrados no tenant. Usa a conexão
 * admin (sem sessão), mas só lê a tabela de tokens daquele tenant. Nunca
 * lança: falha de push não pode derrubar o fluxo de negócio.
 */
export async function sendPushToTenant(
  tenantId: string,
  message: PushMessage,
): Promise<{ sent: number; failed: number }> {
  const rows = await getDb()
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(eq(pushTokens.tenantId, tenantId));

  const tokens = [...new Set(rows.map((row) => row.token))].filter(
    isExpoPushToken,
  );
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (let index = 0; index < tokens.length; index += 100) {
    const chunk = tokens.slice(index, index + 100);
    const messages = chunk.map((to) => ({
      to,
      sound: "default",
      priority: "high",
      title: message.title,
      body: message.body,
      data: message.data ?? {},
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(messages),
        signal: controller.signal,
      });

      if (!response.ok) {
        failed += chunk.length;
        logger.warn("push_send_failed", {
          tenantId,
          status: response.status,
        });
        recordMetric("push_sent", chunk.length, { status: "failed" });
      } else {
        sent += chunk.length;
        recordMetric("push_sent", chunk.length, { status: "ok" });
      }
    } catch (cause) {
      failed += chunk.length;
      logger.warn("push_send_error", {
        tenantId,
        error: String(cause),
      });
      recordMetric("push_sent", chunk.length, { status: "error" });
    } finally {
      clearTimeout(timeout);
    }
  }

  return { sent, failed };
}
