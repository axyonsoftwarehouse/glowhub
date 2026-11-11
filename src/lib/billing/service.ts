import { and, count, eq, gt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  branches,
  invitations,
  memberships,
  platformPayments,
  platformSubscriptions,
  professionals,
} from "@/db/schema";
import { computeAccess, effectiveLimits, type Access, type SubscriptionStatus } from "./access";
import { applyEvent } from "./events";
import {
  PLANS,
  TRIAL_DAYS,
  canAdd,
  exceededLimits,
  limitLabel,
  type LimitKey,
  type PlanId,
  type Usage,
} from "./plans";
import { activeBillingProvider, getBillingProvider, type BillingEvent } from "./providers";

export type PlatformSubscription = typeof platformSubscriptions.$inferSelect & {
  status: SubscriptionStatus;
};

/**
 * Le a assinatura da empresa, criando-a se ainda nao existir: teste gratis de
 * TRIAL_DAYS dias, ou cortesia para tenants de demonstracao (somente leitura).
 */
export async function ensureSubscription(tenant: {
  id: string;
  isReadOnly: boolean;
}): Promise<PlatformSubscription> {
  const db = getDb();
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  await db
    .insert(platformSubscriptions)
    .values(
      tenant.isReadOnly
        ? { tenantId: tenant.id, status: "comp" }
        : { tenantId: tenant.id, status: "trialing", trialEndsAt },
    )
    .onConflictDoNothing();
  const [row] = await db
    .select()
    .from(platformSubscriptions)
    .where(eq(platformSubscriptions.tenantId, tenant.id))
    .limit(1);
  return row as PlatformSubscription;
}

export async function getAccess(tenant: { id: string; isReadOnly: boolean }): Promise<{
  subscription: PlatformSubscription;
  access: Access;
}> {
  const subscription = await ensureSubscription(tenant);
  return { subscription, access: computeAccess(subscription) };
}

export async function getUsage(tenantId: string): Promise<Usage> {
  const db = getDb();
  const [[pros], [units], [members], [invites]] = await Promise.all([
    db
      .select({ n: count() })
      .from(professionals)
      .where(and(eq(professionals.tenantId, tenantId), eq(professionals.isActive, true))),
    db
      .select({ n: count() })
      .from(branches)
      .where(and(eq(branches.tenantId, tenantId), eq(branches.isActive, true))),
    db.select({ n: count() }).from(memberships).where(eq(memberships.tenantId, tenantId)),
    db
      .select({ n: count() })
      .from(invitations)
      .where(and(eq(invitations.tenantId, tenantId), gt(invitations.expiresAt, new Date()))),
  ]);
  return {
    professionals: Number(pros?.n ?? 0),
    branches: Number(units?.n ?? 0),
    members: Number(members?.n ?? 0) + Number(invites?.n ?? 0),
  };
}

/**
 * Confere se a empresa pode adicionar mais um item (profissional, filial ou
 * usuario) no plano vigente. Retorna a mensagem de erro, ou null se couber.
 */
export async function checkPlanLimit(
  tenant: { id: string; isReadOnly: boolean },
  key: LimitKey,
): Promise<string | null> {
  const subscription = await ensureSubscription(tenant);
  const limits = effectiveLimits(subscription);
  const usage = await getUsage(tenant.id);
  if (canAdd(limits, usage, key)) return null;
  const max = limits[key] ?? 0;
  return `Seu plano permite até ${limitLabel(key, max)}. Troque de plano em Plano e cobrança para adicionar mais.`;
}

export type CheckoutResult = { ok: true; url: string } | { ok: false; message: string };

/** Inicia a contratacao (ou troca) de plano e devolve o link de pagamento. */
export async function startCheckout(params: {
  tenant: { id: string; isReadOnly: boolean };
  plan: PlanId;
  payerEmail: string;
}): Promise<CheckoutResult> {
  if (params.tenant.isReadOnly) {
    return { ok: false, message: "Empresas de demonstração não contratam planos." };
  }
  const subscription = await ensureSubscription(params.tenant);
  // Mesmo plano so faz sentido para regularizar (atraso/bloqueio).
  if (
    subscription.status === "active" &&
    subscription.plan === params.plan &&
    computeAccess(subscription).level === "ok"
  ) {
    return { ok: false, message: "Este já é o seu plano atual." };
  }

  const plan = PLANS[params.plan];
  const usage = await getUsage(params.tenant.id);
  const over = exceededLimits(plan.limits, usage);
  if (over.length > 0) {
    const detail = over.map((key) => `${limitLabel(key, usage[key])} (máx. ${plan.limits[key]})`).join(", ");
    return {
      ok: false,
      message: `O plano ${plan.name} não comporta o uso atual: ${detail}. Desative o excedente ou escolha um plano maior.`,
    };
  }

  const provider = activeBillingProvider();
  let created: { providerSubscriptionId: string; checkoutUrl: string };
  try {
    created = await provider.createSubscription({
      tenantId: params.tenant.id,
      planName: plan.name,
      amountCents: plan.priceCents,
      payerEmail: params.payerEmail,
    });
  } catch (cause) {
    logger.error("billing_checkout_failed", {
      provider: provider.id,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return { ok: false, message: "Não foi possível abrir o pagamento agora. Tente novamente." };
  }

  // Um checkout novo substitui o anterior ainda nao pago.
  const previousPending = subscription.pendingProviderSubscriptionId;
  await getDb()
    .update(platformSubscriptions)
    .set({
      provider: provider.id,
      pendingPlan: plan.id,
      pendingProviderSubscriptionId: created.providerSubscriptionId,
      updatedAt: new Date(),
    })
    .where(eq(platformSubscriptions.tenantId, params.tenant.id));
  if (previousPending) await safeCancel(provider.id, previousPending);

  return { ok: true, url: created.checkoutUrl };
}

async function safeCancel(providerId: string, providerSubscriptionId: string): Promise<void> {
  try {
    await getBillingProvider(providerId)?.cancelSubscription(providerSubscriptionId);
  } catch (cause) {
    logger.warn("billing_cancel_failed", {
      provider: providerId,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

/**
 * Aplica um evento do provedor (webhook ou simulacao). Idempotente: o mesmo
 * pagamento (provedor + id) so e contabilizado uma vez.
 */
export async function applyBillingEvent(
  providerId: string,
  event: BillingEvent,
): Promise<{ applied: boolean }> {
  if (event.kind === "ignored") return { applied: false };

  const result = await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(platformSubscriptions)
      .where(
        or(
          eq(platformSubscriptions.providerSubscriptionId, event.providerSubscriptionId),
          eq(platformSubscriptions.pendingProviderSubscriptionId, event.providerSubscriptionId),
        ),
      )
      .for("update")
      .limit(1);
    if (!row) return { applied: false, cancel: null as string | null };

    const outcome = applyEvent(row as PlatformSubscription, event);

    if (event.kind === "payment") {
      const inserted = await tx
        .insert(platformPayments)
        .values({
          tenantId: row.tenantId,
          provider: providerId,
          providerPaymentId: event.providerPaymentId,
          providerSubscriptionId: event.providerSubscriptionId,
          plan: outcome.paymentPlan,
          amountCents: event.amountCents,
          status: event.status,
          paidAt: event.status === "approved" ? event.paidAt : null,
          periodEnd: outcome.patch.currentPeriodEnd ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: platformPayments.id });
      if (inserted.length === 0) return { applied: false, cancel: null };
    }

    if (Object.keys(outcome.patch).length > 0) {
      await tx
        .update(platformSubscriptions)
        .set({ ...outcome.patch, provider: providerId, updatedAt: new Date() })
        .where(eq(platformSubscriptions.tenantId, row.tenantId));
    }
    return { applied: true, cancel: outcome.cancelProviderSubscriptionId };
  });

  if (result.cancel) await safeCancel(providerId, result.cancel);
  return { applied: result.applied };
}

/** Cancela a assinatura paga: o acesso segue ate o fim do periodo ja pago. */
export async function cancelSubscription(tenant: {
  id: string;
  isReadOnly: boolean;
}): Promise<{ ok: boolean; message: string }> {
  const subscription = await ensureSubscription(tenant);
  if (subscription.status !== "active" && subscription.status !== "past_due") {
    return { ok: false, message: "Não há assinatura ativa para cancelar." };
  }
  if (subscription.provider && subscription.providerSubscriptionId) {
    try {
      await getBillingProvider(subscription.provider)?.cancelSubscription(
        subscription.providerSubscriptionId,
      );
    } catch (cause) {
      logger.error("billing_cancel_failed", {
        provider: subscription.provider,
        error: cause instanceof Error ? cause.message : String(cause),
      });
      return { ok: false, message: "Não foi possível cancelar agora. Tente novamente." };
    }
  }
  await getDb()
    .update(platformSubscriptions)
    .set({ status: "canceled", cancelAtPeriodEnd: false, updatedAt: new Date() })
    .where(eq(platformSubscriptions.tenantId, tenant.id));
  return { ok: true, message: "Assinatura cancelada. O acesso continua até o fim do período pago." };
}

export async function listPayments(tenantId: string) {
  return getDb()
    .select()
    .from(platformPayments)
    .where(eq(platformPayments.tenantId, tenantId))
    .orderBy(platformPayments.createdAt)
    .limit(24);
}
