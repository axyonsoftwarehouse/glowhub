"use server";

import { internalError } from "@/lib/errors";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import {
  clientSubscriptions,
  clients,
  planItems,
  services,
  subscriptionPlans,
  subscriptionRedemptions,
} from "@/db/schema";
import { withUser, type AppTx } from "@/lib/db";
import { getSystemAccountId, postEntry } from "@/lib/ledger";
import { parsePriceToCents } from "@/lib/money";
import { getSession } from "@/lib/session";
import {
  addInterval,
  billDueSubscriptions,
} from "@/lib/subscription-billing";
import { getCurrentTenant } from "@/lib/tenant";
import type { SubscriptionActionState } from "./types";

type PaymentMethod = "cash" | "debit" | "credit" | "pix" | "transfer" | "wallet" | "other";

const planPayload = z.object({
  name: z.string().trim().min(2, "Informe ao menos 2 caracteres.").max(120),
  description: z.string().trim().max(1000).optional(),
  price: z.string().trim(),
  interval: z.enum(["month", "year"]),
  items: z
    .array(
      z.object({
        serviceId: z.string().uuid("Serviço inválido."),
        quantityPerPeriod: z.coerce.number().int().min(1).max(1000),
      }),
    )
    .optional()
    .default([]),
});

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

function errorCode(cause: unknown): string | undefined {
  return (cause as { code?: string })?.code;
}

async function context() {
  const tenant = await getCurrentTenant();
  if (!tenant) return { error: "Empresa não resolvida." as const };
  const session = await getSession();
  if (!session?.user) return { error: "Sessão expirada." as const };
  return { tenant, userId: session.user.id };
}

export async function createPlanAction(payload: {
  name: string;
  description?: string;
  price: string;
  interval: "month" | "year";
  items: { serviceId: string; quantityPerPeriod: number }[];
}): Promise<SubscriptionActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  const parsed = planPayload.safeParse(payload);
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  }
  const priceCents = parsePriceToCents(parsed.data.price);
  if (priceCents === null) {
    return { status: "error", fieldErrors: { price: ["Preço inválido."] } };
  }

  try {
    await withUser(ctx.userId, async (tx) => {
      const [plan] = await tx
        .insert(subscriptionPlans)
        .values({
          tenantId: ctx.tenant.id,
          name: parsed.data.name,
          description:
            parsed.data.description && parsed.data.description.length > 0
              ? parsed.data.description
              : null,
          priceCents,
          interval: parsed.data.interval,
        })
        .returning({ id: subscriptionPlans.id });

      if (parsed.data.items.length > 0) {
        await tx.insert(planItems).values(
          parsed.data.items.map((item) => ({
            tenantId: ctx.tenant.id,
            planId: plan.id,
            serviceId: item.serviceId,
            quantityPerPeriod: item.quantityPerPeriod,
          })),
        );
      }
    });
  } catch (cause) {
    if (errorCode(cause) === "23505") {
      return { status: "error", message: "Já existe um plano com esse nome." };
    }
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/subscriptions");
  return { status: "success", message: "Plano criado." };
}

export async function setPlanActiveAction(
  _prev: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!id) return { status: "error", message: "Plano inválido." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(subscriptionPlans)
        .set({ isActive })
        .where(
          and(
            eq(subscriptionPlans.id, id),
            eq(subscriptionPlans.tenantId, ctx.tenant.id),
          ),
        )
        .returning({ id: subscriptionPlans.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Sem permissão para alterar o plano." };
    }
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/subscriptions");
  return { status: "success" };
}

/**
 * Fatura um periodo: D Caixa/Banco / C Receitas a Apropriar (diferida).
 * A receita e reconhecida depois, ao final do periodo (recognizeSubscriptionRevenue).
 */
async function bill(
  tx: AppTx,
  ctx: { tenant: { id: string }; userId: string },
  params: {
    description: string;
    idempotencyKey: string;
    subscriptionId: string;
    priceCents: number;
    method: PaymentMethod;
  },
): Promise<string | null> {
  const deferred = await getSystemAccountId(
    tx,
    ctx.tenant.id,
    "liability_deferred_revenue",
  );
  const debitAccount = await getSystemAccountId(
    tx,
    ctx.tenant.id,
    params.method === "cash" ? "cash" : "bank",
  );
  if (!deferred || !debitAccount) return null;

  return postEntry(tx, {
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    description: params.description,
    idempotencyKey: params.idempotencyKey,
    referenceType: "subscription",
    referenceId: params.subscriptionId,
    lines: [
      { accountId: debitAccount, direction: "debit", amountCents: params.priceCents },
      { accountId: deferred, direction: "credit", amountCents: params.priceCents },
    ],
  });
}

/**
 * Reconhece a receita diferida de um periodo vencido:
 * D Receitas a Apropriar / C Receita de Assinaturas.
 */
async function recognizeSubscriptionRevenue(
  tx: AppTx,
  ctx: { tenant: { id: string }; userId: string },
  params: {
    subscriptionId: string;
    planName: string;
    priceCents: number;
    periodKey: string;
  },
): Promise<void> {
  if (params.priceCents <= 0) return;
  const deferred = await getSystemAccountId(
    tx,
    ctx.tenant.id,
    "liability_deferred_revenue",
  );
  const revenue = await getSystemAccountId(
    tx,
    ctx.tenant.id,
    "revenue_subscription",
  );
  if (!deferred || !revenue) return;

  await postEntry(tx, {
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    description: `Reconhecimento de receita: ${params.planName}`,
    idempotencyKey: `subscription-recog-${params.subscriptionId}-${params.periodKey}`,
    referenceType: "subscription",
    referenceId: params.subscriptionId,
    lines: [
      { accountId: deferred, direction: "debit", amountCents: params.priceCents },
      { accountId: revenue, direction: "credit", amountCents: params.priceCents },
    ],
  });
}

export async function subscribeAction(
  _prev: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const clientId = String(formData.get("clientId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  const method = (String(formData.get("method") ?? "cash") || "cash") as PaymentMethod;
  if (!clientId || !planId) {
    return { status: "error", message: "Selecione o cliente e o plano." };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const result = await withUser(ctx.userId, async (tx) => {
      const [client] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.id, clientId), eq(clients.tenantId, ctx.tenant.id)))
        .limit(1);
      const [plan] = await tx
        .select({
          id: subscriptionPlans.id,
          name: subscriptionPlans.name,
          priceCents: subscriptionPlans.priceCents,
          interval: subscriptionPlans.interval,
        })
        .from(subscriptionPlans)
        .where(
          and(
            eq(subscriptionPlans.id, planId),
            eq(subscriptionPlans.tenantId, ctx.tenant.id),
          ),
        )
        .limit(1);
      if (!client || !plan) return { error: "Cliente ou plano não encontrado." };

      const periodStart = new Date();
      const periodEnd = addInterval(periodStart, plan.interval);

      const [subscription] = await tx
        .insert(clientSubscriptions)
        .values({
          tenantId: ctx.tenant.id,
          clientId,
          planId,
          status: "active",
          priceCents: plan.priceCents,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          createdBy: ctx.userId,
        })
        .returning({ id: clientSubscriptions.id });

      const entryId = await bill(tx, ctx, {
        description: `Assinatura: ${plan.name}`,
        idempotencyKey: `subscription-${subscription.id}-${randomUUID()}`,
        subscriptionId: subscription.id,
        priceCents: plan.priceCents,
        method,
      });
      if (!entryId) {
        throw new Error("Crie o plano de contas padrão em Financeiro.");
      }

      return { ok: true as const };
    });

    if ("error" in result) return { status: "error", message: result.error };
    revalidatePath("/subscriptions");
    revalidatePath("/finance");
    return { status: "success", message: "Assinatura criada." };
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }
}

export async function renewSubscriptionAction(
  _prev: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const id = String(formData.get("id") ?? "");
  const method = (String(formData.get("method") ?? "cash") || "cash") as PaymentMethod;
  if (!id) return { status: "error", message: "Assinatura inválida." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const result = await withUser(ctx.userId, async (tx) => {
      const [subscription] = await tx
        .select({
          id: clientSubscriptions.id,
          status: clientSubscriptions.status,
          priceCents: clientSubscriptions.priceCents,
          currentPeriodEnd: clientSubscriptions.currentPeriodEnd,
          planName: subscriptionPlans.name,
          interval: subscriptionPlans.interval,
        })
        .from(clientSubscriptions)
        .innerJoin(
          subscriptionPlans,
          eq(clientSubscriptions.planId, subscriptionPlans.id),
        )
        .where(
          and(
            eq(clientSubscriptions.id, id),
            eq(clientSubscriptions.tenantId, ctx.tenant.id),
          ),
        )
        .limit(1);
      if (!subscription) return { error: "Assinatura não encontrada." };
      if (subscription.status === "cancelled") {
        return { error: "Assinatura cancelada." };
      }

      const newStart = subscription.currentPeriodEnd;
      const newEnd = addInterval(newStart, subscription.interval);

      await recognizeSubscriptionRevenue(tx, ctx, {
        subscriptionId: subscription.id,
        planName: subscription.planName,
        priceCents: subscription.priceCents,
        periodKey: newStart.toISOString(),
      });

      const entryId = await bill(tx, ctx, {
        description: `Renovação: ${subscription.planName}`,
        idempotencyKey: `subscription-${subscription.id}-${randomUUID()}`,
        subscriptionId: subscription.id,
        priceCents: subscription.priceCents,
        method,
      });
      if (!entryId) {
        throw new Error("Crie o plano de contas padrão em Financeiro.");
      }

      await tx
        .update(clientSubscriptions)
        .set({
          currentPeriodStart: newStart,
          currentPeriodEnd: newEnd,
          status: "active",
        })
        .where(eq(clientSubscriptions.id, subscription.id));

      return { ok: true as const };
    });

    if ("error" in result) return { status: "error", message: result.error };
    revalidatePath("/subscriptions");
    revalidatePath("/finance");
    return { status: "success", message: "Assinatura renovada." };
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }
}

export async function cancelSubscriptionAction(
  _prev: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Assinatura inválida." };

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const updated = await withUser(ctx.userId, async (tx) =>
      tx
        .update(clientSubscriptions)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(
          and(
            eq(clientSubscriptions.id, id),
            eq(clientSubscriptions.tenantId, ctx.tenant.id),
          ),
        )
        .returning({ id: clientSubscriptions.id }),
    );
    if (updated.length === 0) {
      return { status: "error", message: "Assinatura não encontrada." };
    }
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }

  revalidatePath("/subscriptions");
  return { status: "success", message: "Assinatura cancelada." };
}

export async function runSubscriptionBillingAction(): Promise<SubscriptionActionState> {
  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const billed = await withUser(ctx.userId, (tx) =>
      billDueSubscriptions(tx, {
        tenantId: ctx.tenant.id,
        userId: ctx.userId,
      }),
    );
    revalidatePath("/subscriptions");
    revalidatePath("/finance");
    return {
      status: "success",
      message:
        billed > 0
          ? `${billed} assinatura(s) faturada(s).`
          : "Nenhuma assinatura vencida.",
    };
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }
}

export async function redeemSubscriptionServiceAction(
  _prev: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const serviceId = String(formData.get("serviceId") ?? "");
  if (!subscriptionId || !serviceId) {
    return { status: "error", message: "Dados incompletos." };
  }

  const ctx = await context();
  if ("error" in ctx) return { status: "error", message: ctx.error };

  try {
    const result = await withUser(ctx.userId, async (tx) => {
      const [subscription] = await tx
        .select({
          id: clientSubscriptions.id,
          planId: clientSubscriptions.planId,
          status: clientSubscriptions.status,
          currentPeriodStart: clientSubscriptions.currentPeriodStart,
          currentPeriodEnd: clientSubscriptions.currentPeriodEnd,
        })
        .from(clientSubscriptions)
        .where(
          and(
            eq(clientSubscriptions.id, subscriptionId),
            eq(clientSubscriptions.tenantId, ctx.tenant.id),
          ),
        )
        .limit(1);
      if (!subscription) return { error: "Assinatura não encontrada." };
      if (subscription.status !== "active") {
        return { error: "Assinatura não está ativa." };
      }

      const [item] = await tx
        .select({ quantityPerPeriod: planItems.quantityPerPeriod })
        .from(planItems)
        .where(
          and(
            eq(planItems.tenantId, ctx.tenant.id),
            eq(planItems.planId, subscription.planId),
            eq(planItems.serviceId, serviceId),
          ),
        )
        .limit(1);
      if (!item) return { error: "Serviço não incluído no plano." };

      const used = await tx
        .select({ id: subscriptionRedemptions.id })
        .from(subscriptionRedemptions)
        .where(
          and(
            eq(subscriptionRedemptions.tenantId, ctx.tenant.id),
            eq(subscriptionRedemptions.subscriptionId, subscriptionId),
            eq(subscriptionRedemptions.serviceId, serviceId),
            gte(
              subscriptionRedemptions.redeemedAt,
              subscription.currentPeriodStart,
            ),
            lte(
              subscriptionRedemptions.redeemedAt,
              subscription.currentPeriodEnd,
            ),
          ),
        );
      if (used.length >= item.quantityPerPeriod) {
        return { error: "Limite do período atingido para este serviço." };
      }

      const [service] = await tx
        .select({ priceCents: services.priceCents })
        .from(services)
        .where(
          and(
            eq(services.id, serviceId),
            eq(services.tenantId, ctx.tenant.id),
          ),
        )
        .limit(1);

      await tx.insert(subscriptionRedemptions).values({
        tenantId: ctx.tenant.id,
        subscriptionId,
        serviceId,
        amountCents: service?.priceCents ?? 0,
        createdBy: ctx.userId,
      });

      return { ok: true as const };
    });

    if ("error" in result) return { status: "error", message: result.error };
    revalidatePath("/subscriptions");
    return { status: "success", message: "Consumo registrado." };
  } catch (cause) {
    return { status: "error", message: internalError(cause) };
  }
}
