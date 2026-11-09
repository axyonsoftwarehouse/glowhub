import { and, asc, eq } from "drizzle-orm";
import { memberships, professionals, profiles, tenants } from "@/db/schema";
import { auth } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { logger } from "@/lib/logger";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type ApiTenant = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isReadOnly: boolean;
};

export type ApiContext = {
  userId: string;
  user: { id: string; name: string; email: string };
  tenant: ApiTenant;
  role: string;
  professional: { id: string; name: string } | null;
};

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowed = (process.env.API_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowOrigin =
    allowed.length === 0
      ? "*"
      : origin && allowed.includes(origin)
        ? origin
        : null;

  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-tenant-slug",
    "access-control-max-age": "86400",
    vary: "origin",
  };
  if (allowOrigin) headers["access-control-allow-origin"] = allowOrigin;
  return headers;
}

export function apiJson(
  request: Request,
  data: unknown,
  status = 200,
): Response {
  return Response.json(data, { status, headers: corsHeaders(request) });
}

export function apiError(
  request: Request,
  status: number,
  code: string,
  message: string,
): Response {
  return apiJson(request, { error: { code, message } }, status);
}

export function apiPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function handleApi(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (cause) {
      if (cause instanceof ApiError) {
        return apiError(request, cause.status, cause.code, cause.message);
      }
      logger.error("api_unhandled_error", { error: String(cause) });
      return apiError(
        request,
        500,
        "INTERNAL_ERROR",
        "Erro interno ao processar a requisição.",
      );
    }
  };
}

export async function requireSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    throw new ApiError(401, "UNAUTHORIZED", "Sessão ausente ou expirada.");
  }
  return session;
}

/**
 * Sessão + tenant ativo + papel + profissional vinculado. Funciona com cookie
 * (web) ou `Authorization: Bearer <token>` (app mobile, plugin bearer).
 */
export async function requireApiContext(
  request: Request,
): Promise<ApiContext> {
  const session = await requireSession(request);
  const userId = session.user.id;

  const data = await withUser(userId, async (tx) => {
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

    const [tenant] = await tx
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        logoUrl: tenants.logoUrl,
        isReadOnly: tenants.isReadOnly,
      })
      .from(tenants)
      .where(and(eq(tenants.id, tenantId), eq(tenants.isActive, true)))
      .limit(1);
    if (!tenant) return null;

    const [membership] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, tenant.id),
          eq(memberships.userId, userId),
        ),
      )
      .limit(1);
    if (!membership) return null;

    const [professional] = await tx
      .select({ id: professionals.id, name: professionals.name })
      .from(professionals)
      .where(
        and(
          eq(professionals.tenantId, tenant.id),
          eq(professionals.userId, userId),
        ),
      )
      .limit(1);

    return {
      tenant,
      role: membership.role,
      professional: professional ?? null,
    };
  });

  if (!data) {
    throw new ApiError(
      409,
      "NO_TENANT",
      "O usuário não está vinculado a uma empresa ativa.",
    );
  }

  return {
    userId,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
    ...data,
  };
}

/** Lê um valor de query string com validação simples. */
export function readString(
  searchParams: URLSearchParams,
  key: string,
  maxLength = 120,
): string | null {
  const value = searchParams.get(key)?.trim();
  if (!value) return null;
  return value.slice(0, maxLength);
}
