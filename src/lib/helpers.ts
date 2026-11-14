import { and, asc, eq, like } from "drizzle-orm";
import {
  branches,
  ledgerAccounts,
  professionalBranches,
  professionalServices,
  professionals,
  services,
} from "@/db/schema";
import { withUser, type AppTx } from "@/lib/db";

/** Próximo código de conta de ajudante: 2.8.1, 2.8.2, ... */
async function nextHelperAccountCode(
  tx: AppTx,
  tenantId: string,
): Promise<string> {
  const rows = await tx
    .select({ code: ledgerAccounts.code })
    .from(ledgerAccounts)
    .where(
      and(
        eq(ledgerAccounts.tenantId, tenantId),
        like(ledgerAccounts.code, "2.8.%"),
      ),
    );

  let max = 0;
  for (const row of rows) {
    const match = row.code.match(/^2\.8\.(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `2.8.${max + 1}`;
}

export type HelperCreated = {
  professionalId: string;
  accountId: string;
  servicesLinked: number;
};

/**
 * Cria um ajudante eventual: profissional sem login, com comissão e uma conta
 * de passivo própria (2.8.x) para os valores dele não se misturarem ao caixa
 * principal. Vincula a filial ativa e todos os serviços ativos.
 */
export async function createHelper(params: {
  tenantId: string;
  userId: string;
  name: string;
  commissionBp: number;
}): Promise<HelperCreated> {
  return withUser(params.userId, async (tx) => {
    const code = await nextHelperAccountCode(tx, params.tenantId);

    const [account] = await tx
      .insert(ledgerAccounts)
      .values({
        tenantId: params.tenantId,
        code,
        name: `Ajudante: ${params.name}`,
        type: "liability",
      })
      .returning({ id: ledgerAccounts.id });

    const [professional] = await tx
      .insert(professionals)
      .values({
        tenantId: params.tenantId,
        name: params.name,
        commissionBp: params.commissionBp,
        isHelper: true,
        ledgerAccountId: account.id,
      })
      .returning({ id: professionals.id });

    const [branch] = await tx
      .select({ id: branches.id })
      .from(branches)
      .where(
        and(eq(branches.tenantId, params.tenantId), eq(branches.isActive, true)),
      )
      .orderBy(asc(branches.name))
      .limit(1);

    if (branch) {
      await tx
        .insert(professionalBranches)
        .values({
          tenantId: params.tenantId,
          professionalId: professional.id,
          branchId: branch.id,
        })
        .onConflictDoNothing();
    }

    const serviceRows = await tx
      .select({ id: services.id })
      .from(services)
      .where(
        and(eq(services.tenantId, params.tenantId), eq(services.isActive, true)),
      );

    if (serviceRows.length > 0) {
      await tx
        .insert(professionalServices)
        .values(
          serviceRows.map((service) => ({
            tenantId: params.tenantId,
            professionalId: professional.id,
            serviceId: service.id,
          })),
        )
        .onConflictDoNothing();
    }

    return {
      professionalId: professional.id,
      accountId: account.id,
      servicesLinked: serviceRows.length,
    };
  });
}
