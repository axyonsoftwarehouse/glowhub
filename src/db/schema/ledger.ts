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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { appointments, clients } from "./appointments";
import { tenants } from "./tenancy";

export const accountType = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

export const journalDirection = pgEnum("journal_direction", ["debit", "credit"]);

export const chargeStatus = pgEnum("charge_status", ["open", "paid", "void"]);

export const chargeItemKind = pgEnum("charge_item_kind", [
  "service",
  "product",
  "package",
]);

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: accountType("type").notNull(),
    systemKey: text("system_key"),
    parentId: uuid("parent_id").references(
      (): AnyPgColumn => ledgerAccounts.id,
      { onDelete: "set null" },
    ),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ledger_accounts_tenant_code_key").on(t.tenantId, t.code),
    uniqueIndex("ledger_accounts_tenant_system_key")
      .on(t.tenantId, t.systemKey)
      .where(sql`${t.systemKey} is not null`),
    index("ledger_accounts_tenant_idx").on(t.tenantId),
  ],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    description: text("description").notNull(),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    reversesEntryId: uuid("reverses_entry_id").references(
      (): AnyPgColumn => journalEntries.id,
      { onDelete: "set null" },
    ),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("journal_entries_tenant_idempotency_key").on(
      t.tenantId,
      t.idempotencyKey,
    ),
    index("journal_entries_tenant_idx").on(t.tenantId),
    index("journal_entries_occurred_idx").on(t.occurredAt),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    direction: journalDirection("direction").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("journal_lines_tenant_idx").on(t.tenantId),
    index("journal_lines_entry_idx").on(t.entryId),
    index("journal_lines_account_idx").on(t.accountId),
    check("journal_lines_amount_positive", sql`${t.amountCents} > 0`),
  ],
);

export const charges = pgTable(
  "charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    status: chargeStatus("status").notNull().default("open"),
    totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
    revenueEntryId: uuid("revenue_entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    settlementEntryId: uuid("settlement_entry_id").references(
      () => journalEntries.id,
      { onDelete: "set null" },
    ),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("charges_appointment_key").on(t.appointmentId),
    index("charges_tenant_idx").on(t.tenantId),
    check("charges_total_non_negative", sql`${t.totalCents} >= 0`),
  ],
);

export const chargeItems = pgTable(
  "charge_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    chargeId: uuid("charge_id")
      .notNull()
      .references(() => charges.id, { onDelete: "cascade" }),
    kind: chargeItemKind("kind").notNull(),
    referenceId: uuid("reference_id"),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("charge_items_tenant_idx").on(t.tenantId),
    index("charge_items_charge_idx").on(t.chargeId),
    check("charge_items_quantity_positive", sql`${t.quantity} > 0`),
    check("charge_items_total_non_negative", sql`${t.totalCents} >= 0`),
  ],
);
