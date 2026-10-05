import { and, eq } from "drizzle-orm";
import { chargeItems, charges, services } from "@/db/schema";
import type { AppTx } from "@/lib/db";
import { getSystemAccountId, postEntry } from "@/lib/ledger";
import { noShowFeeCents } from "@/lib/tenant-policy";

/**
 * Ao marcar um agendamento como no-show, cria a cobranca da taxa (percentual
 * configurado no tenant) somente se ainda nao houver cobranca para o
 * agendamento. Lanca no ledger: D Contas a Receber / C Receita de Servicos.
 * Idempotente por `noshow-fee-<appointmentId>`.
 */
export async function applyNoShowFee(
  tx: AppTx,
  params: {
    tenantId: string;
    userId: string;
    appointmentId: string;
    clientId: string;
    serviceId: string;
    priceCents: number;
    percent: number;
  },
): Promise<void> {
  const fee = noShowFeeCents(params.priceCents, params.percent);
  if (fee <= 0) return;

  const [existing] = await tx
    .select({ id: charges.id })
    .from(charges)
    .where(
      and(
        eq(charges.tenantId, params.tenantId),
        eq(charges.appointmentId, params.appointmentId),
      ),
    )
    .limit(1);
  if (existing) return;

  const receivable = await getSystemAccountId(
    tx,
    params.tenantId,
    "accounts_receivable",
  );
  const revenue = await getSystemAccountId(
    tx,
    params.tenantId,
    "revenue_service",
  );
  if (!receivable || !revenue) return;

  const [service] = await tx
    .select({ name: services.name })
    .from(services)
    .where(eq(services.id, params.serviceId))
    .limit(1);

  const [charge] = await tx
    .insert(charges)
    .values({
      tenantId: params.tenantId,
      appointmentId: params.appointmentId,
      clientId: params.clientId,
      status: "open",
      totalCents: fee,
      createdBy: params.userId,
    })
    .returning({ id: charges.id });

  await tx.insert(chargeItems).values({
    tenantId: params.tenantId,
    chargeId: charge.id,
    kind: "service",
    referenceId: params.serviceId,
    description: `Taxa de não comparecimento (${service?.name ?? "Serviço"})`,
    quantity: 1,
    unitPriceCents: fee,
    totalCents: fee,
  });

  const entryId = await postEntry(tx, {
    tenantId: params.tenantId,
    userId: params.userId,
    description: "Taxa de não comparecimento",
    idempotencyKey: `noshow-fee-${params.appointmentId}`,
    referenceType: "charge",
    referenceId: charge.id,
    lines: [
      { accountId: receivable, direction: "debit", amountCents: fee },
      { accountId: revenue, direction: "credit", amountCents: fee },
    ],
  });

  await tx
    .update(charges)
    .set({ revenueEntryId: entryId })
    .where(eq(charges.id, charge.id));
}
