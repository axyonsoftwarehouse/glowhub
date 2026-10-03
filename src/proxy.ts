import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { TENANT_HEADER } from "@/lib/tenant";

function resolveTenantSlug(request: NextRequest): string | null {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();

  // Local development: <slug>.localhost
  if (host.endsWith(".localhost")) {
    const sub = host.slice(0, -".localhost".length);
    return sub && sub !== "www" ? sub : null;
  }

  const root = (getEnv().NEXT_PUBLIC_ROOT_DOMAIN ?? "").toLowerCase();
  if (root && host !== root && host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (sub && sub !== "www" && sub !== "app" && sub !== "api") {
      return sub;
    }
  }

  const querySlug = request.nextUrl.searchParams.get("tenant");
  if (querySlug) return querySlug;

  return getEnv().DEFAULT_TENANT_SLUG ?? null;
}

export async function proxy(request: NextRequest) {
  const slug = resolveTenantSlug(request);
  const requestHeaders = new Headers(request.headers);
  if (slug) requestHeaders.set(TENANT_HEADER, slug);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
