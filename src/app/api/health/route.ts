import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isConfigured } from "@/lib/env";
import { sendAlert } from "@/lib/alerts";
import { recordMetric } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return Response.json({ status: "unconfigured" }, { status: 503 });
  }

  try {
    await getDb().execute(sql`select 1`);
    recordMetric("health_check", 1, { status: "ok" });
    return Response.json({ status: "ok", db: "up" });
  } catch (cause) {
    recordMetric("health_check", 1, { status: "error" });
    sendAlert({
      level: "critical",
      title: "health_check_failed",
      context: { error: String(cause) },
    });
    return Response.json({ status: "error", db: "down" }, { status: 503 });
  }
}
