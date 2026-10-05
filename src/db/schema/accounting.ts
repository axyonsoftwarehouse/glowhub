import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";

export const accountingPeriodStatus = pgEnum("accounting_period_status", [
  "open",
  "closed",
]);

export const accountingPeriods = pgTable(
  "accounting_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: accountingPeriodStatus("status").notNull().default("open"),
    snapshot: jsonb("snapshot"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: text("closed_by"),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accounting_periods_tenant_range_key").on(
      t.tenantId,
      t.periodStart,
      t.periodEnd,
    ),
    index("accounting_periods_tenant_idx").on(t.tenantId),
    check("accounting_periods_range_valid", sql`${t.periodEnd} >= ${t.periodStart}`),
  ],
);
