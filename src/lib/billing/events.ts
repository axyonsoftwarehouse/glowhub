import type { SubscriptionStatus } from "./access";
import type { BillingEvent } from "./providers";

export type StoredSubscription = {
  plan: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  providerSubscriptionId: string | null;
  pendingPlan: string | null;
  pendingProviderSubscriptionId: string | null;
};

export type SubscriptionPatch = Partial<
  Pick<
    StoredSubscription,
    "plan" | "status" | "currentPeriodEnd" | "providerSubscriptionId" | "pendingPlan" | "pendingProviderSubscriptionId"
  > & { cancelAtPeriodEnd: boolean; trialEndsAt: Date | null }
>;

export type EventOutcome = {
  /** Campos a atualizar na assinatura (vazio = nada muda). */
  patch: SubscriptionPatch;
  /** Plano a gravar no historico de pagamento. */
  paymentPlan: string | null;
  /** Assinatura antiga no provedor a cancelar (troca de plano concluida). */
  cancelProviderSubscriptionId: string | null;
};

/** Soma um mes, preso ao ultimo dia do mes (31/01 -> 28 ou 29/02). */
export function addMonth(date: Date): Date {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

const NONE: EventOutcome = { patch: {}, paymentPlan: null, cancelProviderSubscriptionId: null };

/**
 * Como um evento do provedor muda a assinatura. Puro: o servico grava o
 * resultado. O primeiro pagamento aprovado de um checkout pendente confirma a
 * contratacao/troca de plano; pagamentos seguintes renovam por mais um mes.
 */
export function applyEvent(sub: StoredSubscription, event: BillingEvent): EventOutcome {
  if (event.kind === "ignored") return NONE;

  const isPending = event.providerSubscriptionId === sub.pendingProviderSubscriptionId;
  const isCurrent = event.providerSubscriptionId === sub.providerSubscriptionId;
  if (!isPending && !isCurrent) return NONE;

  if (event.kind === "subscription") {
    if (event.status === "cancelled") {
      if (isPending) {
        return { ...NONE, patch: { pendingPlan: null, pendingProviderSubscriptionId: null } };
      }
      return { ...NONE, patch: { status: "canceled", cancelAtPeriodEnd: false } };
    }
    if (event.status === "paused" && isCurrent && sub.status === "active") {
      return { ...NONE, patch: { status: "past_due" } };
    }
    return NONE;
  }

  // Pagamento
  if (event.status === "approved") {
    if (isPending) {
      return {
        patch: {
          plan: sub.pendingPlan,
          status: "active",
          currentPeriodEnd: addMonth(event.paidAt),
          providerSubscriptionId: event.providerSubscriptionId,
          pendingPlan: null,
          pendingProviderSubscriptionId: null,
          cancelAtPeriodEnd: false,
        },
        paymentPlan: sub.pendingPlan,
        cancelProviderSubscriptionId:
          sub.providerSubscriptionId && sub.providerSubscriptionId !== event.providerSubscriptionId
            ? sub.providerSubscriptionId
            : null,
      };
    }
    // Renovacao: soma um mes a partir do vencimento (pagamento adiantado) ou da
    // data do pagamento (pagamento atrasado).
    const base =
      sub.currentPeriodEnd && sub.currentPeriodEnd > event.paidAt ? sub.currentPeriodEnd : event.paidAt;
    return {
      patch: { status: "active", currentPeriodEnd: addMonth(base) },
      paymentPlan: sub.plan,
      cancelProviderSubscriptionId: null,
    };
  }

  if (event.status === "rejected" && isCurrent && sub.status === "active") {
    return { patch: { status: "past_due" }, paymentPlan: sub.plan, cancelProviderSubscriptionId: null };
  }

  return { ...NONE, paymentPlan: isPending ? sub.pendingPlan : sub.plan };
}
