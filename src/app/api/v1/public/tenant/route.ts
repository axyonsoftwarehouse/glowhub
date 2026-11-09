import { and, asc, eq } from "drizzle-orm";
import { branches } from "@/db/schema";
import { apiJson, apiPreflight, handleApi } from "@/lib/api";
import { getDb } from "@/lib/db";
import { resolvePublicTenant } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (request) => {
  const tenant = await resolvePublicTenant(request);

  const branchRows = await getDb()
    .select({
      id: branches.id,
      name: branches.name,
      slug: branches.slug,
      address: branches.address,
      timezone: branches.timezone,
    })
    .from(branches)
    .where(
      and(eq(branches.tenantId, tenant.id), eq(branches.isActive, true)),
    )
    .orderBy(asc(branches.name));

  return apiJson(request, { tenant, branches: branchRows });
});

export const OPTIONS = apiPreflight;
