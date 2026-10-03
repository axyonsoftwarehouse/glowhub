"use server";

import { sql } from "drizzle-orm";
import { profiles } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";

export type AcceptInviteResult = { ok: true } | { error: string };

function mapError(message: string): string {
  if (message.includes("invitation_not_found")) {
    return "Convite inválido ou já utilizado.";
  }
  if (message.includes("invitation_expired")) {
    return "Este convite expirou. Peça um novo à pessoa que convidou.";
  }
  if (message.includes("invitation_email_mismatch")) {
    return "Este convite é para outro e-mail. Entre com o e-mail convidado.";
  }
  if (message.includes("invitation_not_authenticated")) {
    return "Faça login para aceitar o convite.";
  }
  return "Não foi possível aceitar o convite.";
}

export async function acceptInviteAction(
  token: string,
): Promise<AcceptInviteResult> {
  const session = await getSession();
  if (!session?.user) return { error: "Faça login para aceitar o convite." };
  const userId = session.user.id;

  try {
    const tenantId = await withUser(userId, async (tx) => {
      const result = await tx.execute(
        sql`select public.accept_invitation(${token}) as tenant_id`,
      );
      const rows = (result as unknown as {
        rows: Array<{ tenant_id: string }>;
      }).rows;
      const acceptedTenantId = rows[0]?.tenant_id ?? null;

      if (acceptedTenantId) {
        await tx
          .insert(profiles)
          .values({ id: userId, activeTenantId: acceptedTenantId })
          .onConflictDoUpdate({
            target: profiles.id,
            set: { activeTenantId: acceptedTenantId },
          });
      }

      return acceptedTenantId;
    });

    if (!tenantId) return { error: "Não foi possível aceitar o convite." };
    return { ok: true };
  } catch (cause) {
    return { error: mapError(String(cause)) };
  }
}
