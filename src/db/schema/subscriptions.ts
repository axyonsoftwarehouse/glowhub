import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { clients } from "./appointments";
import { services } from "./catalog";
import { tenants } from "./tenancy";

export const billingInterval = pgEnum("billing_interval", ["month", "year"]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "active",
  "cancelled",
  "past_due",
]);

export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: bigint("price_cents", { mode: "number" }).notNull().default(0),
    interval: billingInterval("interval").notNull().default("month"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscription_plans_tenant_name_key").on(
      t.tenantId,
      sql`lower(${t.name})`,
    ),
    index("subscription_plans_tenant_idx").on(t.tenantId),
    check("subscription_plans_price_non_negative", sql`${t.priceCents} >= 0`),
  ],
);

export const planItems = pgTable(
  "plan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    quantityPerPeriod: integer("quantity_per_period").notNull().default(1),
  },
  (t) => [
    index("plan_items_plan_idx").on(t.planId),
    check("plan_items_quantity_positive", sql`${t.quantityPerPeriod} > 0`),
  ],
);

export const clientSubscriptions = pgTable(
  "client_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: "restrict" }),
    status: subscriptionStatus("status").notNull().default("active"),
    priceCents: bigint("price_cents", { mode: "number" }).notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("client_subscriptions_tenant_idx").on(t.tenantId),
    index("client_subscriptions_client_idx").on(t.clientId),
  ],
);
