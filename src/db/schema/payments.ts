import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { charges, journalEntries } from "./ledger";
import { tenants } from "./tenancy";

export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "debit",
  "credit",
  "pix",
  "transfer",
  "wallet",
  "other",
]);

export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "confirmed",
  "failed",
  "refunded",
]);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    chargeId: uuid("charge_id")
      .notNull()
      .references(() => charges.id, { onDelete: "restrict" }),
    method: paymentMethod("method").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    provider: text("provider"),
    providerRef: text("provider_ref"),
    idempotencyKey: text("idempotency_key").notNull(),
    entryId: uuid("entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_tenant_idempotency_key").on(t.tenantId, t.idempotencyKey),
    index("payments_tenant_idx").on(t.tenantId),
    index("payments_charge_idx").on(t.chargeId),
    check("payments_amount_positive", sql`${t.amountCents} > 0`),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_events_provider_event_key").on(t.provider, t.eventId),
  ],
);
