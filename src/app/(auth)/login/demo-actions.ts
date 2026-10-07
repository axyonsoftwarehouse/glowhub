"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import {
  branches,
  memberships,
  professionals,
  profiles,
  tenants,
  user,
} from "@/db/schema";

const DEMO_EMAIL = process.env.DEMO_EMAIL?.trim() || "demo@glowhub.app";
const DEMO_TENANT_SLUG = process.env.DEMO_TENANT_SLUG?.trim() || "demo";
const DEMO_EXTRA_SLUGS = (process.env.DEMO_EXTRA_TENANTS ?? "studio-bella,clinica-lumina")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export type DemoLoginResult = { error: string };

/**
 * Garante que a conta demo exista e autentique com a senha configurada. Se a
 * conta existir com outra senha (ex.: apos rotacionar `DEMO_PASSWORD`), recria o
 * usuario demo. O usuario demo e descartavel (so tem vinculos nos tenants demo).
 */
async function ensureDemoAccount(
  requestHeaders: Headers,
  password: string,
): Promise<string | null> {
  try {
    const created = await auth.api.signUpEmail({
      body: { email: DEMO_EMAIL, password, name: "Conta Demo" },
      headers: requestHeaders,
    });
    return created.user.id;
  } catch {
    try {
      const db = getDb();
      const [existing] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, DEMO_EMAIL))
        .limit(1);
      if (existing) {
        await db.delete(user).where(eq(user.id, existing.id));
      }
      const created = await auth.api.signUpEmail({
        body: { email: DEMO_EMAIL, password, name: "Conta Demo" },
        headers: requestHeaders,
      });
      return created.user.id;
    } catch {
      return null;
    }
  }
}

/**
 * Login de demonstracao: garante que a conta demo exista (cria no primeiro
 * acesso), vincula como owner dos tenants demo e entra. Para a equipe testar sem
 * criar conta.
 *
 * Desativado por padrao: so funciona com `NEXT_PUBLIC_DEMO_LOGIN=true` E
 * `DEMO_PASSWORD` definido. O botao na tela e apenas a UI; esta action valida o
 * flag no servidor, entao desliga-la nao depende de esconder o botao.
 */
export async function demoLoginAction(): Promise<DemoLoginResult | void> {
  if (process.env.NEXT_PUBLIC_DEMO_LOGIN !== "true") {
    return { error: "O login de demonstração está desativado." };
  }

  const password = process.env.DEMO_PASSWORD;
  if (!password) {
    return { error: "O login de demonstração não está configurado." };
  }

  const requestHeaders = await headers();

  const limited = await checkRateLimit({
    key: clientKey(requestHeaders, "demo:login"),
    limit: 30,
    windowSeconds: 300,
  });
  if (!limited.allowed) {
    return { error: "Muitas tentativas. Aguarde alguns minutos." };
  }

  let userId: string | null = null;

  try {
    const result = await auth.api.signInEmail({
      body: { email: DEMO_EMAIL, password },
      headers: requestHeaders,
    });
    userId = result.user.id;
  } catch {
    userId = await ensureDemoAccount(requestHeaders, password);
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
