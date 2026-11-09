import { and, eq } from "drizzle-orm";
import { tenants } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";

export type PublicTenant = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

function slugFromHost(host: string): string | null {
  const clean = host.split(":")[0].toLowerCase();
  if (clean.endsWith(".localhost")) {
    const sub = clean.slice(0, -".localhost".length);
    return sub && sub !== "www" ? sub : null;
  }
  const root = (getEnv().NEXT_PUBLIC_ROOT_DOMAIN ?? "").toLowerCase();
  if (root && clean !== root && clean.endsWith(`.${root}`)) {
    const sub = clean.slice(0, -(root.length + 1));
    if (sub && sub !== "www" && sub !== "app" && sub !== "api") return sub;
  }
  return null;
}

/**
 * Tenant do canal público/mobile: `x-tenant-slug`, `?tenant=` ou subdomínio.
 * Diferente do painel, não usa `profiles.active_tenant_id`.
 */
export async function resolvePublicTenant(
  request: Request,
): Promise<PublicTenant> {
  const url = new URL(request.url);
  const slug =
    request.headers.get("x-tenant-slug")?.trim() ||
    url.searchParams.get("tenant")?.trim() ||
    slugFromHost(request.headers.get("host") ?? "");

  if (!slug) {
    throw new ApiError(
      400,
      "TENANT_REQUIRED",
      "Informe o tenant em x-tenant-slug, ?tenant= ou pelo subdomínio.",
    );
  }

  const [tenant] = await getDb()
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      logoUrl: tenants.logoUrl,
    })
    .from(tenants)
    .where(and(eq(tenants.slug, slug), eq(tenants.isActive, true)))
    .limit(1);

  if (!tenant) {
    throw new ApiError(404, "TENANT_NOT_FOUND", "Empresa não encontrada.");
  }
  return tenant;
}
