import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sendAlert } from "@/lib/alerts";
import { recordMetric } from "@/lib/metrics";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Rate limit fixed-window em banco (serverless-safe, sem servico externo).
 * Fail-open: em erro de infraestrutura, permite a requisicao (nunca derruba o
 * login por causa do limiter) e registra o erro.
 */
export async function checkRateLimit(params: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = params;

  try {
    const result = await getDb().execute(sql`
      insert into public.rate_limits (key, window_start, count)
      values (${key}, now(), 1)
      on conflict (key) do update set
        count = case
          when public.rate_limits.window_start <= now() - make_interval(secs => ${windowSeconds})
          then 1
          else public.rate_limits.count + 1
        end,
        window_start = case
          when public.rate_limits.window_start <= now() - make_interval(secs => ${windowSeconds})
          then now()
          else public.rate_limits.window_start
        end
      returning count
    `);

    const rows = (result as unknown as { rows?: { count: number }[] }).rows;
    const count = Number(rows?.[0]?.count ?? 1);

    if (count > limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds: windowSeconds };
    }
    return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
  } catch (cause) {
    recordMetric("rate_limit_error", 1, { key });
    sendAlert({
      level: "error",
      title: "rate_limit_error",
      context: { key, error: String(cause) },
    });
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}

export function clientKey(headers: Headers, scope: string): string {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const ip =
    forwarded.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown";
  return `${scope}:${ip}`;
}
