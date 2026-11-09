"use server";

import { isUuid } from "@/lib/validation";
import { internalError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { memberships, payments } from "@/db/schema";
import { withUser, type AppTx } from "@/lib/db";
import { confirmPendingPayment } from "@/lib/payments/confirm";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { ReconcileState } from "./types";

const MANAGE_ROLES = ["owner", "admin", "manager", "staff"];

async function canManage(
  tx: AppTx,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const [membership] = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)),
    )
    .limit(1);
  return MANAGE_ROLES.includes(membership?.role ?? "");
}

/**
 * Concilia um pagamento pendente (ex.: gateway online ou aguardando o provedor):
 * confirma o recebimento, lanca no ledger e marca a cobranca como paga se
 * coberta. Reproduz o efeito de um webhook (mesma logica compartilhada).
 */
export async function confirmPaymentAction(
  _prev: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!isUuid(paymentId)) {
    return { status: "error", message: "Pagamento inválido." };
  }

  const tenant = await getCurrentTenant();
  if (!tenant) return { status: "error", message: "Empresa não resolvida." };
  const session = await getSession();
  if (!session?.user) return { status: "error", message: "Sessão expirada." };
  const userId = session.user.id;

  try {
    const result = await withUser(userId, async (tx) => {
      if (!(await canManage(tx, tenant.id, userId))) {
        return { error: "Seu papel não permite conciliar pagamentos." };
      }
      return confirmPendingPayment(tx, {
        tenantId: tenant.id,
        userId,
        paymentId,
      });
    });

    if ("error" in result) {
      return { status: "error", message: result.error };
    }
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

/**
 * Cancela um pagamento pendente do gateway (checkout abandonado/recusado).
 * Não mexe no ledger: nenhum recebimento existia. A cobrança continua aberta
 * para nova tentativa.
 */
export async function cancelPendingPaymentAction(
  _prev: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  const paymentId = String(formData.get("paymentId") ?? "");
  if (!isUuid(paymentId)) {
    return { status: "error", message: "Pagamento inválido." };
  }

  const tenant = await getCurrentTenant();
  if (!tenant) return { status: "error", message: "Empresa não resolvida." };
  const session = await getSession();
  if (!session?.user) return { status: "error", message: "Sessão expirada." };
  const userId = session.user.id;

  try {
    const result = await withUser(userId, async (tx) => {
      if (!(await canManage(tx, tenant.id, userId))) {
        return { error: "Seu papel não permite cancelar pagamentos." };
      }

      const [payment] = await tx
        .select({ id: payments.id, status: payments.status })
        .from(payments)
        .where(
          and(
            eq(payments.id, paymentId),
            eq(payments.tenantId, tenant.id),
          ),
        )
        .limit(1);
      if (!payment) return { error: "Pagamento não encontrado." };
      if (payment.status !== "pending") {
        return { ok: true as const, already: true };
      }

      await tx
        .update(payments)
        .set({ status: "failed" })
        .where(
          and(
            eq(payments.id, payment.id),
            eq(payments.tenantId, tenant.id),
          ),
        );
      return { ok: true as const, already: false };
    });

    if ("error" in result) {
      return { status: "error", message: result.error };
    }
    revalidatePath("/reconciliation");
    revalidatePath("/finance");
    return {
      status: "success",
      message: result.already
        ? "O pagamento não estava mais pendente."
        : "Pagamento pendente cancelado.",
    };
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }
}
