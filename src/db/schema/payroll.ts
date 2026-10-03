import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { journalEntries } from "./ledger";
import { paymentMethod } from "./payments";
import { professionals } from "./professionals";
import { tenants } from "./tenancy";

export const earningKind = pgEnum("earning_kind", ["commission", "tip"]);

export const earningStatus = pgEnum("earning_status", ["pending", "paid"]);

export const earnings = pgTable(
  "earnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "restrict" }),
    kind: earningKind("kind").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    status: earningStatus("status").notNull().default("pending"),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    payoutId: uuid("payout_id").references((): AnyPgColumn => payouts.id, {
      onDelete: "set null",
    }),
    entryId: uuid("entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("earnings_tenant_idx").on(t.tenantId),
    index("earnings_professional_idx").on(t.professionalId),
    check("earnings_amount_positive", sql`${t.amountCents} > 0`),
  ],
);

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "restrict" }),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    method: paymentMethod("method").notNull().default("cash"),
    idempotencyKey: text("idempotency_key").notNull(),
    entryId: uuid("entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payouts_tenant_idempotency_key").on(t.tenantId, t.idempotencyKey),
    index("payouts_tenant_idx").on(t.tenantId),
    check("payouts_total_positive", sql`${t.totalCents} > 0`),
  ],
);
