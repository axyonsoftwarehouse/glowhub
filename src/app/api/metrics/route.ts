import { timingSafeEqual } from "node:crypto";
import { getMetricsSnapshot } from "@/lib/metrics";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const token = process.env.METRICS_TOKEN;
  if (!token) return false;
  const expected = `Bearer ${token}`;
  const provided = request.headers.get("authorization") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Scrape das metricas em memoria da instancia.
 *
 * Protegido por `METRICS_TOKEN` (Authorization: Bearer <token>). Sem o token
 * configurado o endpoint responde 404 (nao expoe nada por padrao). Os contadores
 * sao por instancia (serverless); para series historicas use um log drain, que
 * recebe as linhas `message: "metric"`.
 */
export async function GET(request: Request) {
  if (!process.env.METRICS_TOKEN) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return Response.json({
    uptimeSeconds: Math.round(process.uptime()),
    metrics: getMetricsSnapshot(),
  });
}
