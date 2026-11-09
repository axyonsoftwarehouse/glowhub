import { and, eq } from "drizzle-orm";
import { memberships, profiles, tenants } from "@/db/schema";
import {
  apiError,
  apiJson,
  apiPreflight,
  ApiError,
  handleApi,
  requireSession,
} from "@/lib/api";
import { withUser } from "@/lib/db";
import { isUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = handleApi(async (request) => {
  const session = await requireSession(request);
  const userId = session.user.id;

  const body = (await request.json().catch(() => null)) as
    | { tenantId?: unknown }
    | null;
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
  if (!isUuid(tenantId)) {
    throw new ApiError(400, "INVALID_TENANT", "Informe um tenantId válido.");
  }

  const tenant = await withUser(userId, async (tx) => {
    const [membership] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, tenantId),
          eq(memberships.userId, userId),
        ),
      )
      .limit(1);
    if (!membership) return null;

    const [row] = await tx
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        logoUrl: tenants.logoUrl,
        isReadOnly: tenants.isReadOnly,
        isSolo: tenants.isSolo,
        role: memberships.role,
      })
      .from(tenants)
      .innerJoin(memberships, eq(memberships.tenantId, tenants.id))
      .where(
        and(
          eq(tenants.id, tenantId),
          eq(tenants.isActive, true),
          eq(memberships.userId, userId),
        ),
      )
      .limit(1);
    if (!row) return null;

    await tx
      .insert(profiles)
      .values({ id: userId, activeTenantId: tenantId })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { activeTenantId: tenantId },
      });

    return row;
  });

  if (!tenant) {
    return apiError(
      request,
      403,
      "TENANT_FORBIDDEN",
      "Você não tem acesso a esta empresa.",
    );
  }

  return apiJson(request, { ok: true, tenant });
});

export const OPTIONS = apiPreflight;
