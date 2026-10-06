"use server";

import { internalError } from "@/lib/errors";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { charges, payments } from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSystemAccountId, postEntry } from "@/lib/ledger";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { ReconcileState } from "./types";

/**
 * Concilia um pagamento pendente (ex.: aguardando o gateway): confirma o
 * recebimento, lanca no ledger (D Caixa/Banco, C Contas a Receber) e marca a
 * cobranca como paga se o total for coberto. Reproduz o efeito de um webhook.
 */
export async function confirmPaymentAction(
  _prev: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!paymentId) return { status: "error", message: "Pagamento inválido." };

  const tenant = await getCurrentTenant();
  if (!tenant) return { status: "error", message: "Empresa não resolvida." };
  const session = await getSession();
  if (!session?.user) return { status: "error", message: "Sessão expirada." };
  const userId = session.user.id;

  try {
    const result = await withUser(userId, async (tx) => {
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
          and(eq(payments.id, paymentId), eq(payments.tenantId, tenant.id)),
        )
        .limit(1);
      if (!payment) return { error: "Pagamento não encontrado." };
      if (payment.status !== "pending") {
        return { ok: true as const, already: true };
      }

      const debitAccount = await getSystemAccountId(
        tx,
        tenant.id,
        payment.method === "cash" ? "cash" : "bank",
      );
      const receivable = await getSystemAccountId(
        tx,
        tenant.id,
        "accounts_receivable",
      );
      if (!debitAccount || !receivable) {
        return { error: "Crie o plano de contas padrão em Financeiro." };
      }

      const entryId = await postEntry(tx, {
        tenantId: tenant.id,
        userId,
        description: `Conciliação (${payment.method})`,
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
        .where(eq(payments.id, payment.id));

      const confirmed = await tx
        .select({ amountCents: payments.amountCents })
        .from(payments)
        .where(
          and(
            eq(payments.chargeId, payment.chargeId),
            eq(payments.status, "confirmed"),
          ),
        );
      const paid = confirmed.reduce((sum, row) => sum + row.amountCents, 0);

      const [charge] = await tx
        .select({ totalCents: charges.totalCents })
        .from(charges)
        .where(eq(charges.id, payment.chargeId))
        .limit(1);

      if (charge && paid >= charge.totalCents) {
        await tx
          .update(charges)
          .set({ status: "paid", settlementEntryId: entryId })
          .where(eq(charges.id, payment.chargeId));
      }

      return { ok: true as const, already: false };
    });

    if ("error" in result) return { status: "error", message: result.error };
    revalidatePath("/reconciliation");
    revalidatePath("/finance");
    return {
      status: "success",
      message: result.already ? "Já estava conciliado." : "Pagamento conciliado.",
    };
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }
}
