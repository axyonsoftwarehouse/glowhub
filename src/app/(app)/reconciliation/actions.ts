"use server";

import { isUuid } from "@/lib/validation";
import { internalError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db";
import { confirmPendingPayment } from "@/lib/payments/confirm";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import type { ReconcileState } from "./types";

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
    const result = await withUser(userId, (tx) =>
      confirmPendingPayment(tx, {
        tenantId: tenant.id,
        userId,
        paymentId,
      }),
    );

    if (!result.ok) return { status: "error", message: result.error };
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
