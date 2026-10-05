"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  branches,
  memberships,
  professionals,
  profiles,
  tenants,
} from "@/db/schema";

const DEMO_EMAIL = process.env.DEMO_EMAIL?.trim() || "demo@glowhub.app";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo123456";
const DEMO_TENANT_SLUG = process.env.DEMO_TENANT_SLUG?.trim() || "demo";
const DEMO_EXTRA_SLUGS = (process.env.DEMO_EXTRA_TENANTS ?? "studio-bella,clinica-lumina")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
    const slugs = [DEMO_TENANT_SLUG, ...DEMO_EXTRA_SLUGS];

    let primaryTenantId: string | null = null;

    for (const slug of slugs) {
      let [tenant] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);

      // So cria automaticamente o tenant principal; os extras sao ignorados
      // se nao existirem (ex.: antes de rodar o seed demo).
      if (!tenant) {
        if (slug !== DEMO_TENANT_SLUG) continue;
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

      if (!primaryTenantId) primaryTenantId = tenant.id;

      await db
        .insert(memberships)
        .values({ tenantId: tenant.id, userId, role: "owner" })
        .onConflictDoUpdate({
          target: [memberships.tenantId, memberships.userId],
          set: { role: "owner" },
        });
    }

    if (primaryTenantId) {
      await db
        .insert(profiles)
        .values({ id: userId, activeTenantId: primaryTenantId })
        .onConflictDoUpdate({
          target: profiles.id,
          set: { activeTenantId: primaryTenantId },
        });

      // Vincula a conta demo a um profissional (visão "Minha agenda").
      // Idempotente: só vincula se ainda não houver profissional ligado.
      const [alreadyLinked] = await db
        .select({ id: professionals.id })
        .from(professionals)
        .where(
          and(
            eq(professionals.tenantId, primaryTenantId),
            eq(professionals.userId, userId),
          ),
        )
        .limit(1);

      if (!alreadyLinked) {
        const [candidate] = await db
          .select({ id: professionals.id })
          .from(professionals)
          .where(
            and(
              eq(professionals.tenantId, primaryTenantId),
              isNull(professionals.userId),
            ),
          )
          .orderBy(asc(professionals.createdAt))
          .limit(1);
        if (candidate) {
          await db
            .update(professionals)
            .set({ userId })
            .where(eq(professionals.id, candidate.id));
        }
      }
    }
  } catch {
    return { error: "Nao foi possivel preparar a conta demo." };
  }

  redirect("/dashboard");
}
