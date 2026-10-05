import { and, asc, eq } from "drizzle-orm";
import {
  clientSubscriptions,
  clients,
  memberships,
  planItems,
  services,
  subscriptionPlans,
  subscriptionRedemptions,
} from "@/db/schema";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getCurrentTenant } from "@/lib/tenant";
import { PlanForm } from "./plan-form";
import { SubscriptionManager } from "./subscription-manager";
import type {
  ClientOption,
  ClientSubscription,
  ServiceOption,
  SubscriptionPlan,
} from "./types";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager", "staff"];

export default async function SubscriptionsPage() {
  const tenant = await getCurrentTenant();

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm">
        <h1 className="text-lg font-semibold">Nenhuma empresa ativa</h1>
        <p className="mt-2 text-foreground/70">
          Selecione ou configure um tenant para gerenciar assinaturas.
        </p>
      </div>
    );
  }

  const session = await getSession();
  const userId = session?.user?.id ?? "";

  const data = await withUser(userId, async (tx) => {
    const planRows = await tx
      .select({
        id: subscriptionPlans.id,
        name: subscriptionPlans.name,
        description: subscriptionPlans.description,
        priceCents: subscriptionPlans.priceCents,
        interval: subscriptionPlans.interval,
        isActive: subscriptionPlans.isActive,
      })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.tenantId, tenant.id))
      .orderBy(asc(subscriptionPlans.name));

    const itemRows = await tx
      .select({
        planId: planItems.planId,
        serviceId: planItems.serviceId,
        quantityPerPeriod: planItems.quantityPerPeriod,
      })
      .from(planItems)
      .where(eq(planItems.tenantId, tenant.id));

    const serviceRows = await tx
      .select({ id: services.id, name: services.name })
      .from(services)
      .where(eq(services.tenantId, tenant.id))
      .orderBy(asc(services.name));

    const clientRows = await tx
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(eq(clients.tenantId, tenant.id), eq(clients.isActive, true)))
      .orderBy(asc(clients.name));

    const subscriptionRows = await tx
      .select({
        id: clientSubscriptions.id,
        clientId: clientSubscriptions.clientId,
        planId: clientSubscriptions.planId,
        status: clientSubscriptions.status,
        priceCents: clientSubscriptions.priceCents,
        currentPeriodStart: clientSubscriptions.currentPeriodStart,
        currentPeriodEnd: clientSubscriptions.currentPeriodEnd,
      })
      .from(clientSubscriptions)
      .where(eq(clientSubscriptions.tenantId, tenant.id));

    const redemptionRows = await tx
      .select({
        subscriptionId: subscriptionRedemptions.subscriptionId,
        serviceId: subscriptionRedemptions.serviceId,
        redeemedAt: subscriptionRedemptions.redeemedAt,
      })
      .from(subscriptionRedemptions)
      .where(eq(subscriptionRedemptions.tenantId, tenant.id));

    const [membership] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, tenant.id),
          eq(memberships.userId, userId),
        ),
      )
      .limit(1);

    return {
      planRows,
      itemRows,
      serviceRows,
      clientRows,
      subscriptionRows,
      redemptionRows,
      canManage: MANAGE_ROLES.includes(membership?.role ?? ""),
    };
  });

  const serviceName = new Map(data.serviceRows.map((row) => [row.id, row.name]));
  const clientName = new Map(data.clientRows.map((row) => [row.id, row.name]));

  const itemsByPlan = new Map<
    string,
    { serviceId: string; serviceName: string; quantityPerPeriod: number }[]
  >();
  for (const item of data.itemRows) {
    const list = itemsByPlan.get(item.planId) ?? [];
    list.push({
      serviceId: item.serviceId,
      serviceName: serviceName.get(item.serviceId) ?? "Serviço",
      quantityPerPeriod: item.quantityPerPeriod,
    });
    itemsByPlan.set(item.planId, list);
  }

  const plans: SubscriptionPlan[] = data.planRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    priceCents: row.priceCents,
    interval: row.interval,
    isActive: row.isActive,
    items: itemsByPlan.get(row.id) ?? [],
  }));

  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const redemptionsBySubscription = new Map<
    string,
    { serviceId: string; redeemedAt: Date }[]
  >();
  for (const row of data.redemptionRows) {
    const list = redemptionsBySubscription.get(row.subscriptionId) ?? [];
    list.push({ serviceId: row.serviceId, redeemedAt: row.redeemedAt });
    redemptionsBySubscription.set(row.subscriptionId, list);
  }

  const subscriptions: ClientSubscription[] = data.subscriptionRows.map((row) => {
    const plan = planById.get(row.planId);
    const periodStart = row.currentPeriodStart.getTime();
    const periodEnd = row.currentPeriodEnd.getTime();
    const redemptions = redemptionsBySubscription.get(row.id) ?? [];
    const usage = (plan?.items ?? []).map((item) => ({
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      limit: item.quantityPerPeriod,
      used: redemptions.filter(
        (redemption) =>
          redemption.serviceId === item.serviceId &&
          redemption.redeemedAt.getTime() >= periodStart &&
          redemption.redeemedAt.getTime() <= periodEnd,
      ).length,
    }));

    return {
      id: row.id,
      clientName: clientName.get(row.clientId) ?? "Cliente",
      planName: plan?.name ?? "Plano",
      status: row.status,
      priceCents: row.priceCents,
      interval: plan?.interval ?? "month",
      currentPeriodStart: row.currentPeriodStart.toISOString(),
      currentPeriodEnd: row.currentPeriodEnd.toISOString(),
      usage,
    };
  });

  const serviceOptions: ServiceOption[] = data.serviceRows;
  const clientOptions: ClientOption[] = data.clientRows;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-brand">Comercial</p>
        <h1 className="mt-2 text-2xl font-semibold">Assinaturas</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Planos recorrentes de {tenant.name}, com cobrança no ledger.
        </p>
      </header>

      <PlanForm
        plans={plans}
        services={serviceOptions}
        canManage={data.canManage}
      />

      <SubscriptionManager
        plans={plans}
        clients={clientOptions}
        subscriptions={subscriptions}
        canManage={data.canManage}
      />
    </div>
  );
}
