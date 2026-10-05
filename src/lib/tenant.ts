import { cache } from "react";
import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { memberships, professionals, profiles, tenants } from "@/db/schema";
import { getDb, withUser, type AppTx } from "@/lib/db";
import { getEnv, isConfigured } from "@/lib/env";
import { getSession } from "@/lib/session";

export const TENANT_HEADER = "x-tenant-slug";

export type CurrentTenant = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
};

export type UserTenant = CurrentTenant & {
  role: string;
};

export async function getTenantSlugFromHeaders(): Promise<string | null> {
  const requestHeaders = await headers();
  const fromHeader = requestHeaders.get(TENANT_HEADER);
  if (fromHeader) return fromHeader;
  return getEnv().DEFAULT_TENANT_SLUG ?? null;
}

function mapTenant(row: {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
}): CurrentTenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl: row.logoUrl ?? null,
  };
}

async function loadTenantById(
  tx: AppTx,
  id: string,
): Promise<CurrentTenant | null> {
  const [row] = await tx
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      logoUrl: tenants.logoUrl,
    })
    .from(tenants)
    .where(and(eq(tenants.id, id), eq(tenants.isActive, true)))
    .limit(1);
  return row ? mapTenant(row) : null;
}

async function loadTenantBySlug(slug: string): Promise<CurrentTenant | null> {
  const [row] = await getDb()
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      logoUrl: tenants.logoUrl,
    })
    .from(tenants)
    .where(and(eq(tenants.slug, slug), eq(tenants.isActive, true)))
    .limit(1);
  return row ? mapTenant(row) : null;
}

export const getCurrentTenant = cache(async (): Promise<CurrentTenant | null> => {
  if (!isConfigured()) return null;

  const session = await getSession();
  const userId = session?.user?.id;

  if (userId) {
    const tenant = await withUser(userId, async (tx) => {
      const [profile] = await tx
        .select({ activeTenantId: profiles.activeTenantId })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);

      let tenantId = profile?.activeTenantId ?? null;
      if (!tenantId) {
        const [first] = await tx
          .select({ tenantId: memberships.tenantId })
          .from(memberships)
          .where(eq(memberships.userId, userId))
          .orderBy(asc(memberships.createdAt))
          .limit(1);
        tenantId = first?.tenantId ?? null;
      }
      if (!tenantId) return null;
      return loadTenantById(tx, tenantId);
    });
    if (tenant) return tenant;
  }

  const slug = await getTenantSlugFromHeaders();
  if (!slug) return null;
  return loadTenantBySlug(slug);
});

export type MyProfessional = {
  id: string;
  name: string;
};

/**
 * Profissional vinculado ao usuário logado no tenant ativo.
 * Usado para a visão "Minha agenda" (agenda própria, somente leitura).
 */
export const getMyProfessional = cache(
  async (): Promise<MyProfessional | null> => {
    if (!isConfigured()) return null;

    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) return null;

    const tenant = await getCurrentTenant();
    if (!tenant) return null;

    return withUser(userId, async (tx) => {
      const [row] = await tx
        .select({ id: professionals.id, name: professionals.name })
        .from(professionals)
        .where(
          and(
            eq(professionals.tenantId, tenant.id),
            eq(professionals.userId, userId),
          ),
        )
        .limit(1);
      return row ?? null;
    });
  },
);

export const getUserTenants = cache(async (): Promise<UserTenant[]> => {
  if (!isConfigured()) return [];

  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return [];

  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        logoUrl: tenants.logoUrl,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
      .where(and(eq(memberships.userId, userId), eq(tenants.isActive, true)))
      .orderBy(asc(tenants.name));

    return rows.map((row) => ({ ...mapTenant(row), role: row.role }));
  });
});
