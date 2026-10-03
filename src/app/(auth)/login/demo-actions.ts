"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { branches, memberships, profiles, tenants } from "@/db/schema";

const DEMO_EMAIL = process.env.DEMO_EMAIL?.trim() || "demo@glowhub.app";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo123456";
const DEMO_TENANT_SLUG = process.env.DEMO_TENANT_SLUG?.trim() || "demo";

export type DemoLoginResult = { error: string };

/**
 * Login de demonstracao: garante que a conta demo exista (cria no primeiro
 * acesso), vincula como owner do tenant demo e entra. Para a equipe testar sem
 * criar conta. Pode ser desativado com NEXT_PUBLIC_DEMO_LOGIN=false.
 */
export async function demoLoginAction(): Promise<DemoLoginResult | void> {
  const requestHeaders = await headers();

  let userId: string | null = null;

  try {
    const result = await auth.api.signInEmail({
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      headers: requestHeaders,
    });
    userId = result.user.id;
  } catch {
    try {
      const result = await auth.api.signUpEmail({
        body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Conta Demo" },
        headers: requestHeaders,
      });
      userId = result.user.id;
    } catch {
      return { error: "Nao foi possivel entrar na conta demo." };
    }
  }

  if (!userId) return { error: "Nao foi possivel entrar na conta demo." };

  try {
    const db = getDb();

    let tenant: { id: string } | undefined;
    [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, DEMO_TENANT_SLUG))
      .limit(1);

    if (!tenant) {
      const created = await db
        .insert(tenants)
        .values({ slug: DEMO_TENANT_SLUG, name: "GlowHub Demo" })
        .returning({ id: tenants.id });
      tenant = created[0];
      await db
        .insert(branches)
        .values({ tenantId: tenant.id, slug: "matriz", name: "Matriz" })
        .onConflictDoNothing();
    }

    await db
      .insert(memberships)
      .values({ tenantId: tenant.id, userId, role: "owner" })
      .onConflictDoUpdate({
        target: [memberships.tenantId, memberships.userId],
        set: { role: "owner" },
      });

    await db
      .insert(profiles)
      .values({ id: userId, activeTenantId: tenant.id })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { activeTenantId: tenant.id },
      });
  } catch {
    return { error: "Nao foi possivel preparar a conta demo." };
  }

  redirect("/dashboard");
}
