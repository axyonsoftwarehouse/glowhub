import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";

/**
 * Assinatura do GlowHub contratada por cada empresa (billing da plataforma, nao
 * confundir com `client_subscriptions`, vendidas pelo salao aos clientes).
 * Uma linha por tenant, criada sob demanda (teste gratis ou cortesia na demo).
 * Tabela interna: so pela conexao admin (role revogada em db/rls.sql).
 */
export const platformSubscriptions = pgTable(
  "platform_subscriptions",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Plano pago vigente (`solo`/`equipe`/`rede`); nulo no teste/cortesia. */
    plan: text("plan"),
    /** trialing | active | past_due | canceled | comp */
    status: text("status").notNull(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    provider: text("provider"),
    providerSubscriptionId: text("provider_subscription_id"),
    /** Checkout em andamento (troca/contratacao), confirmado pelo 1o pagamento. */
    pendingPlan: text("pending_plan"),
    pendingProviderSubscriptionId: text("pending_provider_subscription_id"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("platform_subscriptions_provider_sub_key").on(t.providerSubscriptionId),
    uniqueIndex("platform_subscriptions_pending_sub_key").on(t.pendingProviderSubscriptionId),
  ],
);

/** Pagamentos recebidos da assinatura da plataforma (idempotentes por provedor). */
export const platformPayments = pgTable(
  "platform_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    providerSubscriptionId: text("provider_subscription_id"),
    plan: text("plan"),
    amountCents: integer("amount_cents").notNull(),
    /** approved | rejected | refunded */
    status: text("status").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("platform_payments_provider_key").on(t.provider, t.providerPaymentId),
    index("platform_payments_tenant_idx").on(t.tenantId),
  ],
);
