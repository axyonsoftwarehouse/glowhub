import { logger } from "@/lib/logger";

export type MetricTags = Record<string, string | number | boolean>;

export type MetricPoint = {
  name: string;
  value: number;
  tags: MetricTags;
};

/** Contadores em memoria (por instancia). Uteis em dev/self-host e no /api/metrics. */
const counters = new Map<string, MetricPoint>();

const SINK_TIMEOUT_MS = 2000;

function metricKey(name: string, tags: MetricTags): string {
  const parts = Object.keys(tags)
    .sort()
    .map((key) => `${key}=${String(tags[key])}`);
  return parts.length > 0 ? `${name}{${parts.join(",")}}` : name;
}

/**
 * Registra uma metrica de forma portavel.
 *
 * Sempre emite uma linha JSON estruturada (`level: "info"`, `message: "metric"`)
 * que pode ser coletada por log drains (Vercel/Axiom/Datadog). Se
 * `METRICS_WEBHOOK_URL` estiver configurada, tambem envia um POST best-effort ao
 * coletor. Nunca lanca nem bloqueia a requisicao (fire-and-forget com timeout).
 *
 * Espelha o adapter de e-mail (`src/lib/email.ts`): trocar de coletor = ajustar
 * apenas esta funcao.
 */
export function recordMetric(
  name: string,
  value = 1,
  tags: MetricTags = {},
): void {
  const key = metricKey(name, tags);
  const current = counters.get(key);
  counters.set(key, {
    name,
    value: (current?.value ?? 0) + value,
    tags,
  });

  logger.info("metric", { metric: name, value, ...tags });

  const url = process.env.METRICS_WEBHOOK_URL;
  if (url) {
    void pushMetric(url, { name, value, tags, time: new Date().toISOString() });
  }
}

/** Atalho para contadores (`recordMetric` com valor 1). */
export function increment(name: string, tags: MetricTags = {}): void {
  recordMetric(name, 1, tags);
}

/** Snapshot dos contadores em memoria da instancia atual. */
export function getMetricsSnapshot(): MetricPoint[] {
  return Array.from(counters.values());
}

/** Zera os contadores em memoria (usado em testes). */
export function resetMetrics(): void {
  counters.clear();
}

async function pushMetric(
  url: string,
  point: MetricPoint & { time: string },
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SINK_TIMEOUT_MS);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(point),
      signal: controller.signal,
    });
  } catch {
    // Best-effort: metricas nunca devem derrubar a requisicao.
  } finally {
    clearTimeout(timeout);
  }
}
