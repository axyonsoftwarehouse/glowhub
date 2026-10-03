"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { memberships, profiles } from "@/db/schema";
import { auth } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export type SwitchTenantResult = { ok: true } | { error: string };

export async function switchTenantAction(
  tenantId: string,
): Promise<SwitchTenantResult> {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const result = await withUser(userId, async (tx) => {
    const [membership] = await tx
      .select({ tenantId: memberships.tenantId })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, tenantId),
          eq(memberships.userId, userId),
        ),
      )
      .limit(1);

    if (!membership) {
      return { error: "Voce nao e membro desta empresa." } as const;
    }

    await tx
      .insert(profiles)
      .values({ id: userId, activeTenantId: tenantId })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { activeTenantId: tenantId },
      });

    return { ok: true } as const;
  });

  if ("error" in result) return result;
  revalidatePath("/", "layout");
  return result;
}
