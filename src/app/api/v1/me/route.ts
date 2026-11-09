import { and, asc, eq } from "drizzle-orm";
import { memberships, tenants } from "@/db/schema";
import {
  apiJson,
  apiPreflight,
  handleApi,
  requireApiContext,
} from "@/lib/api";
import { withUser } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handleApi(async (request) => {
  const ctx = await requireApiContext(request);

  const tenantRows = await withUser(ctx.userId, (tx) =>
    tx
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        logoUrl: tenants.logoUrl,
        isReadOnly: tenants.isReadOnly,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
      .where(
        and(
          eq(memberships.userId, ctx.userId),
          eq(tenants.isActive, true),
        ),
      )
      .orderBy(asc(tenants.name)),
  );

  return apiJson(request, {
    user: ctx.user,
    tenant: ctx.tenant,
    role: ctx.role,
    professional: ctx.professional,
    tenants: tenantRows,
  });
});

export const OPTIONS = apiPreflight;
