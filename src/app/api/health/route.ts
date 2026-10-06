import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return Response.json({ status: "unconfigured" }, { status: 503 });
  }

  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok", db: "up" });
  } catch (cause) {
    logger.error("health_check_failed", { error: String(cause) });
    return Response.json({ status: "error", db: "down" }, { status: 503 });
  }
}
