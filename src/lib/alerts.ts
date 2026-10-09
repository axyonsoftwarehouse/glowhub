import { logger } from "@/lib/logger";

export type AlertLevel = "warn" | "error" | "critical";

const LEVEL_RANK: Record<AlertLevel, number> = { warn: 1, error: 2, critical: 3 };

const DEFAULT_MIN_LEVEL: AlertLevel = "error";
const DEFAULT_COOLDOWN_SECONDS = 300;

/** Ultimo envio por titulo (throttle em memoria, por instancia). */
const lastSentAt = new Map<string, number>();

function minLevel(): AlertLevel {
  const value = process.env.ALERT_MIN_LEVEL as AlertLevel | undefined;
  return value && value in LEVEL_RANK ? value : DEFAULT_MIN_LEVEL;
}

function cooldownMs(): number {
  const raw = Number(process.env.ALERT_COOLDOWN_SECONDS);
  const seconds =
    Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_COOLDOWN_SECONDS;
  return seconds * 1000;
}

/**
 * Dispara um alerta externo de forma portavel.
 *
 * Sempre registra no log estruturado (via `logger`). Se `ALERT_WEBHOOK_URL`
 * estiver configurada e o nivel atingir `ALERT_MIN_LEVEL` (padrao `error`),
 * envia um POST best-effort com payload compativel com Slack/Discord/Mattermost
 * (`{ text, ... }`). Alertas com o mesmo titulo sao suprimidos por
 * `ALERT_COOLDOWN_SECONDS` (padrao 300s) para evitar tempestade.
 *
 * Nunca lanca nem bloqueia a requisicao.
 */
export function sendAlert(params: {
  level: AlertLevel;
  title: string;
  context?: Record<string, unknown>;
}): void {
  const { level, title, context } = params;

  if (level === "warn") logger.warn(`alert:${title}`, context);
  else logger.error(`alert:${title}`, context);

  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel()]) return;

  const now = Date.now();
  if (now - (lastSentAt.get(title) ?? 0) < cooldownMs()) return;
  lastSentAt.set(title, now);

  void pushAlert(url, {
    level,
    title,
    context,
    time: new Date().toISOString(),
  });
}

/** Limpa o throttle em memoria (usado em testes). */
export function resetAlerts(): void {
  lastSentAt.clear();
}

async function pushAlert(
  url: string,
  alert: {
    level: AlertLevel;
    title: string;
    context?: Record<string, unknown>;
    time: string;
  },
): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[${alert.level.toUpperCase()}] ${alert.title}`,
        ...alert,
      }),
    });
  } catch {
    // Best-effort: um alerta que falhou nao deve derrubar a requisicao.
  }
}
