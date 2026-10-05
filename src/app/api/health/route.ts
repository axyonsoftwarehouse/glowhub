import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return Response.json(
      { status: "unconfigured", db: "unknown" },
      { status: 503 },
    );
  }

  const started = Date.now();
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({
      status: "ok",
      db: "up",
      latencyMs: Date.now() - started,
      time: new Date().toISOString(),
    });
  } catch (cause) {
    logger.error("health_check_failed", { error: String(cause) });
    return Response.json(
      { status: "error", db: "down", latencyMs: Date.now() - started },
      { status: 503 },
    );
  }
}
