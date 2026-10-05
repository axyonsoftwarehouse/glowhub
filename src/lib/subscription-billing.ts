import { and, eq, lte } from "drizzle-orm";
import { clientSubscriptions, subscriptionPlans } from "@/db/schema";
import type { AppTx } from "@/lib/db";
import { getSystemAccountId, postEntry } from "@/lib/ledger";

export function addInterval(date: Date, interval: "month" | "year"): Date {
  const next = new Date(date);
  if (interval === "year") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Fatura (renova) as assinaturas ativas vencidas de um tenant: lanca no ledger
 * D Caixa/Banco / C Receita de Assinaturas e avanca o periodo. Idempotente por
 * `subscription-<id>-<inicioPeriodo>`. Retorna quantas foram faturadas.
 */
export async function billDueSubscriptions(
  tx: AppTx,
  params: { tenantId: string; userId: string | null; now?: Date },
): Promise<number> {
  const now = params.now ?? new Date();

  const due = await tx
    .select({
      id: clientSubscriptions.id,
      priceCents: clientSubscriptions.priceCents,
      currentPeriodEnd: clientSubscriptions.currentPeriodEnd,
      interval: subscriptionPlans.interval,
      planName: subscriptionPlans.name,
    })
    .from(clientSubscriptions)
    .innerJoin(
      subscriptionPlans,
      eq(clientSubscriptions.planId, subscriptionPlans.id),
    )
    .where(
      and(
        eq(clientSubscriptions.tenantId, params.tenantId),
        eq(clientSubscriptions.status, "active"),
        lte(clientSubscriptions.currentPeriodEnd, now),
      ),
    );

  if (due.length === 0) return 0;

  const revenue = await getSystemAccountId(
    tx,
    params.tenantId,
    "revenue_subscription",
  );
  const deferred = await getSystemAccountId(
    tx,
    params.tenantId,
    "liability_deferred_revenue",
  );
  const bank = await getSystemAccountId(tx, params.tenantId, "bank");
  const cash = await getSystemAccountId(tx, params.tenantId, "cash");
  const debitAccount = bank ?? cash;

  let billed = 0;
  for (const sub of due) {
    const newStart = sub.currentPeriodEnd;
    const newEnd = addInterval(newStart, sub.interval);
    const periodKey = newStart.toISOString();

    // Reconhece a receita do periodo que acabou (D Diferida / C Receita).
    if (sub.priceCents > 0 && deferred && revenue) {
      await postEntry(tx, {
        tenantId: params.tenantId,
        userId: params.userId ?? "system",
        description: `Reconhecimento de receita: ${sub.planName}`,
        idempotencyKey: `subscription-recog-${sub.id}-${periodKey}`,
        referenceType: "subscription",
        referenceId: sub.id,
        lines: [
          { accountId: deferred, direction: "debit", amountCents: sub.priceCents },
          { accountId: revenue, direction: "credit", amountCents: sub.priceCents },
        ],
      });
    }

    // Fatura o novo periodo, diferindo a receita (D Caixa/Banco / C Diferida).
    if (sub.priceCents > 0 && deferred && debitAccount) {
      await postEntry(tx, {
        tenantId: params.tenantId,
        userId: params.userId ?? "system",
        description: `Renovação automática: ${sub.planName}`,
        idempotencyKey: `subscription-${sub.id}-${periodKey}`,
        referenceType: "subscription",
        referenceId: sub.id,
        lines: [
          { accountId: debitAccount, direction: "debit", amountCents: sub.priceCents },
          { accountId: deferred, direction: "credit", amountCents: sub.priceCents },
        ],
      });
    }

    await tx
      .update(clientSubscriptions)
      .set({
        currentPeriodStart: newStart,
        currentPeriodEnd: newEnd,
        status: "active",
      })
      .where(eq(clientSubscriptions.id, sub.id));

    billed += 1;
  }

  return billed;
}
