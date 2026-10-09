import { and, eq } from "drizzle-orm";
import { charges, payments } from "@/db/schema";
import type { AppTx } from "@/lib/db";
import { awardChargePoints } from "@/lib/loyalty";
import { getSystemAccountId, postEntry } from "@/lib/ledger";
import type { WebhookResult } from "./types";

export type ConfirmPaymentResult =
  | { ok: true; already: boolean }
  | { ok: false; error: string };

/**
 * Confirma um pagamento pendente: lanca no ledger (D Caixa/Banco,
 * C Contas a Receber), marca `confirmed` e a cobranca como `paid` se coberta,
 * alem de creditar os pontos de fidelidade. Idempotente.
 */
export async function confirmPendingPayment(
  tx: AppTx,
  params: { tenantId: string; userId: string; paymentId: string },
): Promise<ConfirmPaymentResult> {
  const [payment] = await tx
    .select({
      id: payments.id,
      chargeId: payments.chargeId,
      method: payments.method,
      amountCents: payments.amountCents,
      status: payments.status,
    })
    .from(payments)
    .where(
      and(
        eq(payments.id, params.paymentId),
        eq(payments.tenantId, params.tenantId),
      ),
    )
    .limit(1);
  if (!payment) return { ok: false, error: "Pagamento não encontrado." };
  if (payment.status !== "pending") return { ok: true, already: true };

  const debitAccount = await getSystemAccountId(
    tx,
    params.tenantId,
    payment.method === "cash" ? "cash" : "bank",
  );
  const receivable = await getSystemAccountId(
    tx,
    params.tenantId,
    "accounts_receivable",
  );
  if (!debitAccount || !receivable) {
    return { ok: false, error: "Crie o plano de contas padrão em Financeiro." };
  }

  const entryId = await postEntry(tx, {
    tenantId: params.tenantId,
    userId: params.userId,
    description: `Recebimento confirmado (${payment.method})`,
    idempotencyKey: `payment-confirm-${payment.id}`,
    referenceType: "payment",
    referenceId: payment.id,
    lines: [
      { accountId: debitAccount, direction: "debit", amountCents: payment.amountCents },
      { accountId: receivable, direction: "credit", amountCents: payment.amountCents },
    ],
  });

  await tx
    .update(payments)
    .set({ status: "confirmed", entryId })
    .where(and(eq(payments.id, payment.id), eq(payments.tenantId, params.tenantId)));

  const confirmed = await tx
    .select({ amountCents: payments.amountCents })
    .from(payments)
    .where(
      and(
        eq(payments.chargeId, payment.chargeId),
        eq(payments.tenantId, params.tenantId),
        eq(payments.status, "confirmed"),
      ),
    );
  const paid = confirmed.reduce((sum, row) => sum + row.amountCents, 0);

  const [charge] = await tx
    .select({ totalCents: charges.totalCents, clientId: charges.clientId })
    .from(charges)
    .where(
      and(
        eq(charges.id, payment.chargeId),
        eq(charges.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (charge && paid >= charge.totalCents) {
    await tx
      .update(charges)
      .set({ status: "paid", settlementEntryId: entryId })
      .where(
        and(
          eq(charges.id, payment.chargeId),
          eq(charges.tenantId, params.tenantId),
        ),
      );
    if (charge.clientId) {
      await awardChargePoints(tx, {
        tenantId: params.tenantId,
        userId: params.userId,
        chargeId: payment.chargeId,
        clientId: charge.clientId,
        amountCents: charge.totalCents,
      });
    }
  }

  return { ok: true, already: false };
}

async function reverseConfirmedPayment(
  tx: AppTx,
  payment: {
    id: string;
    tenantId: string;
    method: string;
    amountCents: number;
    entryId: string | null;
  },
): Promise<void> {
  const debitAccount = await getSystemAccountId(
    tx,
    payment.tenantId,
    payment.method === "cash" ? "cash" : "bank",
  );
  const receivable = await getSystemAccountId(
    tx,
    payment.tenantId,
    "accounts_receivable",
  );
  if (debitAccount && receivable) {
    await postEntry(tx, {
      tenantId: payment.tenantId,
      userId: "",
      description: "Estorno de pagamento online",
      idempotencyKey: `payment-refund-${payment.id}`,
      referenceType: "payment",
      referenceId: payment.id,
      reversesEntryId: payment.entryId,
      lines: [
        { accountId: receivable, direction: "debit", amountCents: payment.amountCents },
        { accountId: debitAccount, direction: "credit", amountCents: payment.amountCents },
      ],
    });
  }
  await tx
    .update(payments)
    .set({ status: "refunded" })
    .where(eq(payments.id, payment.id));
}

/**
 * Aplica o resultado de um webhook do provedor ao pagamento correspondente
 * (por `provider` + `provider_ref`). Usado pelo endpoint e pelo mock local.
 */
export async function processPaymentWebhook(
  tx: AppTx,
  params: { providerId: string; result: WebhookResult },
): Promise<WebhookResult> {
  const { providerId, result } = params;
  if (result.kind !== "payment") return result;

  const [payment] = await tx
    .select({
      id: payments.id,
      tenantId: payments.tenantId,
      status: payments.status,
      method: payments.method,
      amountCents: payments.amountCents,
      entryId: payments.entryId,
    })
    .from(payments)
    .where(
      and(
        eq(payments.provider, providerId),
        eq(payments.providerRef, result.providerRef),
      ),
    )
    .limit(1);
  if (!payment) return result;

  if (result.status === "approved") {
    await confirmPendingPayment(tx, {
      tenantId: payment.tenantId,
      userId: "",
      paymentId: payment.id,
    });
  } else if (result.status === "rejected" && payment.status === "pending") {
    await tx
      .update(payments)
      .set({ status: "failed" })
      .where(eq(payments.id, payment.id));
  } else if (result.status === "refunded") {
    if (payment.status === "confirmed") {
      await reverseConfirmedPayment(tx, payment);
    } else if (payment.status !== "refunded") {
      await tx
        .update(payments)
        .set({ status: "refunded" })
        .where(eq(payments.id, payment.id));
    }
  }

  return result;
}
