import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { tenants } from "@/db/schema";
import { getDb } from "@/lib/db";
import { billDueSubscriptions } from "@/lib/subscription-billing";

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
 * Cron de renovacao de assinaturas (Vercel Cron envia GET com
 * `Authorization: Bearer $CRON_SECRET`). Idempotente: avanca o periodo e usa
 * `idempotency_key` por assinatura/periodo.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const tenantRows = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.isActive, true));

  let billed = 0;
  for (const tenant of tenantRows) {
    const count = await db.transaction((tx) =>
      billDueSubscriptions(tx, { tenantId: tenant.id, userId: null }),
    );
    billed += count;
  }

  return NextResponse.json({ tenants: tenantRows.length, billed });
}
